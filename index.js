const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET);


const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;

// MongoDB connection
const uri = "mongodb+srv://007shojibkhan5:007shojibkhan5@cluster1.mhhrtuq.mongodb.net/?appName=Cluster1";
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

// Collections define করছি GLOBAL ভাবে
let userCollection, clubCollection, eventCollection, paymentCollection, membershipCollection;

async function run() {
    try {
        await client.connect();
        const db = client.db('club_sphere');

        // Collections initialize করছি
        userCollection = db.collection('users');
        clubCollection = db.collection('clubs');
        eventCollection = db.collection('events');
        paymentCollection = db.collection('payments');
        membershipCollection = db.collection('memberships');

        console.log("✅ Connected to MongoDB");
        console.log("📁 Collections initialized successfully");
        
        // Health check endpoint
        app.get('/health', async (req, res) => {
            try {
                // Check if all collections are available
                const collections = await db.listCollections().toArray();
                const collectionNames = collections.map(c => c.name);
                
                res.status(200).json({
                    status: 'healthy',
                    message: 'Server is running',
                    collections: collectionNames,
                    isConnected: true,
                    timestamp: new Date()
                });
            } catch (error) {
                res.status(500).json({
                    status: 'unhealthy',
                    error: error.message
                });
            }
        });

    } catch (error) {
        console.error("❌ Failed to connect to MongoDB:", error);
        process.exit(1);
    }
}

run().catch(console.error);

/* ===========================
       USERS APIs
===========================*/

// Get Users + Search
app.get('/users', async (req, res) => {
    try {
        const search = req.query.searchText;
        const query = search
            ? { $or: [{ displayName: new RegExp(search, "i") }, { email: new RegExp(search, "i") }] }
            : {};

        const users = await userCollection.find(query).sort({ createdAt: -1 }).toArray();
        res.send(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send({ error: 'Failed to fetch users' });
    }
});

// Get User Role
app.get('/users/:email/role', async (req, res) => {
    try {
        const user = await userCollection.findOne({ email: req.params.email });
        res.send({ role: user?.role || 'member' });
    } catch (error) {
        console.error('Error fetching user role:', error);
        res.status(500).send({ error: 'Failed to fetch user role' });
    }
});

// Create User
app.post('/users', async (req, res) => {
    try {
        const user = req.body;
        const exists = await userCollection.findOne({ email: user.email });

        if (exists) return res.send({ message: 'user exists' });

        user.createdAt = new Date();
        const result = await userCollection.insertOne(user);
        res.send(result);
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).send({ error: 'Failed to create user' });
    }
});

// Update Role
app.patch('/users/:id/role', async (req, res) => {
    try {
        const result = await userCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { role: req.body.role } }
        );
        res.send(result);
    } catch (error) {
        console.error('Error updating role:', error);
        res.status(500).send({ error: 'Failed to update role' });
    }
});


/* ===========================
        CLUBS APIs
===========================*/

// Get clubs (managerEmail + status + search support)
app.get('/clubs', async (req, res) => {
    try {
        const { managerEmail, status, search } = req.query;
        let query = {};

        if (managerEmail) query.managerEmail = managerEmail;
        if (status) query.status = status;
        if (search) {
            const regex = new RegExp(search, "i");
            query.$or = [
                { clubName: regex },
                { description: regex },
                { category: regex }
            ];
        }

        const clubs = await clubCollection.find(query).sort({ createdAt: -1 }).toArray();
        res.send(clubs);
    } catch (error) {
        console.error('Error fetching clubs:', error);
        res.status(500).send({ error: 'Failed to fetch clubs' });
    }
});

// Public Clubs
app.get('/clubs/all', async (req, res) => {
    try {
        const { category, limit = 20 } = req.query;
        let query = { status: { $in: ['approved', 'active'] } };
        if (category) query.category = category;

        const clubs = await clubCollection
            .find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .toArray();
        res.send(clubs);
    } catch (error) {
        console.error('Error fetching public clubs:', error);
        res.status(500).send({ error: 'Failed to fetch clubs' });
    }
});

// Single club
app.get('/clubs/:id', async (req, res) => {
    try {
        const club = await clubCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!club) return res.status(404).send({ message: "Club not found" });

        res.send(club);
    } catch (error) {
        console.error('Error fetching club:', error);
        res.status(500).send({ error: 'Failed to fetch club' });
    }
});

// Create club
app.post('/clubs', async (req, res) => {
    try {
        const c = req.body;

        if (!c.clubName || !c.description || !c.category || !c.location || !c.managerEmail) {
            return res.status(400).send({ message: "Missing required fields" });
        }

        c.createdAt = new Date();
        c.updatedAt = new Date();
        c.status = 'pending';
        c.members = [];
        c.totalMembers = 0;
        c.events = [];
        c.membershipFee = c.membershipFee || 0;

        const result = await clubCollection.insertOne(c);
        res.status(201).send(result);
    } catch (error) {
        console.error('Error creating club:', error);
        res.status(500).send({ error: 'Failed to create club' });
    }
});

// Update club
app.patch('/clubs/:id', async (req, res) => {
    try {
        const updateData = { ...req.body, updatedAt: new Date() };

        const result = await clubCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updateData }
        );

        if (!result.matchedCount) return res.status(404).send({ message: "Club not found" });
        res.send(result);
    } catch (error) {
        console.error('Error updating club:', error);
        res.status(500).send({ error: 'Failed to update club' });
    }
});

// Update club status
app.patch('/clubs/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const valid = ['pending', 'approved', 'rejected', 'active', 'inactive'];
        if (!valid.includes(status)) return res.status(400).send({ message: "Invalid status" });

        const result = await clubCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { status, updatedAt: new Date() } }
        );
        res.send(result);
    } catch (error) {
        console.error('Error updating club status:', error);
        res.status(500).send({ error: 'Failed to update club status' });
    }
});

// Delete club
app.delete('/clubs/:id', async (req, res) => {
    try {
        const result = await clubCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (!result.deletedCount) return res.status(404).send({ message: "Club not found" });

        res.send({ message: "Club deleted successfully" });
    } catch (error) {
        console.error('Error deleting club:', error);
        res.status(500).send({ error: 'Failed to delete club' });
    }
});

// Join club
app.patch('/clubs/:id/join', async (req, res) => {
    try {
        const { userId, userEmail } = req.body;
        if (!userId || !userEmail) return res.status(400).send({ message: "Missing user data" });

        const club = await clubCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!club) return res.status(404).send({ message: "Club not found" });

        if (club.members && club.members.some(m => m.userId === userId))
            return res.status(400).send({ message: "Already a member" });

        const result = await clubCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            {
                $push: { members: { userId, userEmail, joinedAt: new Date() } },
                $inc: { totalMembers: 1 },
                $set: { updatedAt: new Date() }
            }
        );
        res.send(result);
    } catch (error) {
        console.error('Error joining club:', error);
        res.status(500).send({ error: 'Failed to join club' });
    }
});

// Leave club
app.patch('/clubs/:id/leave', async (req, res) => {
    try {
        const result = await clubCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            {
                $pull: { members: { userId: req.body.userId } },
                $inc: { totalMembers: -1 },
                $set: { updatedAt: new Date() }
            }
        );
        res.send(result);
    } catch (error) {
        console.error('Error leaving club:', error);
        res.status(500).send({ error: 'Failed to leave club' });
    }
});

// Clubs by category
app.get('/clubs/category/:category', async (req, res) => {
    try {
        const regex = new RegExp(req.params.category, "i");
        const clubs = await clubCollection.find({
            category: regex,
            status: { $in: ['approved', 'active'] }
        })
            .sort({ createdAt: -1 })
            .toArray();
        res.send(clubs);
    } catch (error) {
        console.error('Error fetching clubs by category:', error);
        res.status(500).send({ error: 'Failed to fetch clubs' });
    }
});

// Search clubs
app.get('/clubs/search/:keyword', async (req, res) => {
    try {
        const regex = new RegExp(req.params.keyword, "i");

        const clubs = await clubCollection.find({
            $or: [
                { clubName: regex },
                { description: regex },
                { category: regex },
                { location: regex }
            ],
            status: { $in: ['approved', 'active'] }
        })
            .sort({ createdAt: -1 })
            .toArray();
        res.send(clubs);
    } catch (error) {
        console.error('Error searching clubs:', error);
        res.status(500).send({ error: 'Failed to search clubs' });
    }
});

// Stats
app.get('/clubs-stats', async (req, res) => {
    try {
        const totalClubs = await clubCollection.countDocuments();
        const approved = await clubCollection.countDocuments({ status: 'approved' });
        const pending = await clubCollection.countDocuments({ status: 'pending' });
        const active = await clubCollection.countDocuments({ status: 'active' });

        const categoryStats = await clubCollection.aggregate([
            { $match: { status: 'approved' } },
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).toArray();

        res.send({ totalClubs, approved, pending, active, categoryStats });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).send({ error: 'Failed to fetch stats' });
    }
});

// Create Stripe Checkout Session
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { userEmail, amount, clubId, clubName } = req.body;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `${clubName} Membership`,
                        description: `Join ${clubName}`,
                    },
                    unit_amount: amount * 100,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&clubId=${clubId}`,
            cancel_url: `${process.env.FRONTEND_URL}/club/${clubId}`,
            customer_email: userEmail,
            metadata: { userEmail, clubId }
        });

        // Create payment record with required fields
        const payment = {
            userEmail,
            amount,
            type: 'membership',
            clubId,
            stripePaymentIntentId: session.payment_intent,
            status: 'pending',
            createdAt: new Date()
        };
        await paymentCollection.insertOne(payment);

        res.send({ 
            url: session.url,
            sessionId: session.id
        });

    } catch (error) {
        console.error('Stripe error:', error);
        res.status(500).send({ error: 'Payment failed' });
    }
});

// Verify Payment
app.get('/verify-payment/:sessionId', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
        
        if (session.payment_status === 'paid') {
            const payment = await paymentCollection.findOne({ 
                stripePaymentIntentId: session.payment_intent 
            });
            
            if (payment) {
                // Update payment status
                await paymentCollection.updateOne(
                    { stripePaymentIntentId: session.payment_intent },
                    { $set: { status: 'completed' } }
                );

                // Create membership with required fields
                await membershipCollection.insertOne(
                    { userEmail: payment.userEmail, clubId: payment.clubId },
                    { 
                        $set: { 
                            userEmail: payment.userEmail,
                            clubId: payment.clubId,
                            status: 'active',
                            paymentId: session.payment_intent,
                            joinedAt: new Date()
                        } 
                    },
                    { upsert: true }
                );
            }

            res.send({ success: true, paid: true });
        } else {
            res.send({ success: true, paid: false });
        }
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

/* ===========================
        MEMBERSHIP APIs
===========================*/

// Check membership
app.get('/memberships/check', async (req, res) => {
    try {
        const { clubId, userEmail } = req.query;
        const membership = await membershipCollection.findOne({ 
            clubId, 
            userEmail, 
            status: 'active' 
        });
        res.send({ isMember: !!membership });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

// Get user's memberships
app.get('/memberships/user/:email', async (req, res) => {
    try {
        const memberships = await membershipCollection.find({ 
            userEmail: req.params.email 
        }).toArray();
        res.send(memberships);
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

// Leave club (delete membership)
app.delete('/memberships/:clubId', async (req, res) => {
    try {
        const { userEmail } = req.query;
        const result = await membershipCollection.deleteOne({
            clubId: req.params.clubId,
            userEmail
        });
        res.send(result);
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

/* ===========================
        PAYMENT APIs (Admin/Manager)
===========================*/

// Get all payments (for admin)
app.get('/payments', async (req, res) => {
    try {
        const payments = await paymentCollection.find({}).sort({ createdAt: -1 }).toArray();
        res.send(payments);
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

// Get payment stats (revenue overview)
app.get('/payments/stats', async (req, res) => {
    try {
        const totalRevenue = await paymentCollection.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).toArray();

        const revenueByType = await paymentCollection.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: '$type', total: { $sum: '$amount' } } }
        ]).toArray();

        res.send({
            totalRevenue: totalRevenue[0]?.total || 0,
            revenueByType
        });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
})

/* ===========================
        EVENTS APIs - FIXED
===========================*/

// Get events by clubId
app.get('/events', async (req, res) => {
    try {
        const { clubId } = req.query;

        if (!clubId) {
            return res.status(400).send({ message: 'clubId is required' });
        }

        const events = await eventCollection.find({ clubId }).sort({ eventDate: 1 }).toArray();
        res.send(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).send({ error: 'Failed to fetch events' });
    }
});

// Get all events for manager's clubs
app.get('/events/manager', async (req, res) => {
    try {
        const { managerEmail } = req.query;

        if (!managerEmail) {
            return res.status(400).send({ message: 'managerEmail is required' });
        }

        // First get all clubs managed by this user
        const clubs = await clubCollection.find({ managerEmail }).toArray();
        const clubIds = clubs.map(club => club._id.toString());

        if (clubIds.length === 0) {
            return res.send([]);
        }

        // Get events for all these clubs
        const events = await eventCollection.find({
            clubId: { $in: clubIds }
        }).sort({ eventDate: 1 }).toArray();

        res.send(events);
    } catch (error) {
        console.error('Error fetching manager events:', error);
        res.status(500).send({ error: 'Failed to fetch events' });
    }
});

// Create new event
app.post('/events', async (req, res) => {
    try {
        const eventData = req.body;

        // Validation
        if (!eventData.clubId || !eventData.title || !eventData.eventDate || !eventData.location) {
            return res.status(400).send({ message: 'Missing required fields' });
        }

        // সব events free হবে
        eventData.isPaid = false;
        eventData.eventFee = 0;
        eventData.createdAt = new Date();

        const result = await eventCollection.insertOne(eventData);
        res.status(201).send(result);
    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).send({ error: 'Failed to create event' });
    }
});

// Update event
app.patch('/events/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const updateData = req.body;

        // Free events রাখা
        updateData.isPaid = false;
        updateData.eventFee = 0;

        const result = await eventCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).send({ message: 'Event not found' });
        }

        res.send(result);
    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).send({ error: 'Failed to update event' });
    }
});

// Delete event
app.delete('/events/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const result = await eventCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return res.status(404).send({ message: 'Event not found' });
        }

        res.send({ message: 'Event deleted successfully' });
    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).send({ error: 'Failed to delete event' });
    }
});


/* ===========================
        SERVER
===========================*/

app.get('/', (req, res) => res.send("Club Sphere Server Running"));

app.listen(port, () =>
    console.log(`Club Sphere Server running at port ${port}`)
);