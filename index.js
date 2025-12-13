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
let userCollection, clubCollection, eventCollection, paymentCollection, membershipCollection, eventRegistrationCollection;

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
        eventRegistrationCollection = db.collection('eventRegistration');

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



// 1. Get all members of a specific club (for club manager)
app.get('/clubs/:clubId/members', async (req, res) => {
    try {
        const { clubId } = req.params;
        const { status } = req.query;

        // First verify the club exists
        const club = await clubCollection.findOne({ 
            _id: new ObjectId(clubId) 
        });

        if (!club) {
            return res.status(404).json({
                success: false,
                message: 'Club not found'
            });
        }

        // Build query for memberships
        let query = { clubId: clubId };
        if (status) {
            query.status = status;
        }

        // Get all memberships for this club
        const memberships = await membershipCollection.find(query).toArray();

        // Get user details for each member
        const membersWithDetails = await Promise.all(
            memberships.map(async (membership) => {
                const user = await userCollection.findOne({ 
                    email: membership.userEmail 
                }, {
                    projection: { 
                        displayName: 1, 
                        email: 1, 
                        photoURL: 1 
                    }
                });

                return {
                    ...membership,
                    userDetails: user || {
                        displayName: 'Unknown User',
                        email: membership.userEmail,
                        photoURL: null
                    }
                };
            })
        );

        res.json({
            success: true,
            club: {
                _id: club._id,
                clubName: club.clubName,
                totalMembers: membersWithDetails.length
            },
            members: membersWithDetails,
            count: membersWithDetails.length
        });

    } catch (error) {
        console.error('Error fetching club members:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch club members'
        });
    }
});

// 2. Update member status (for club manager)
app.patch('/clubs/:clubId/members/:memberId/status', async (req, res) => {
    try {
        const { clubId, memberId } = req.params;
        const { status } = req.body;

        // Valid statuses
        const validStatuses = ['active', 'inactive', 'expired', 'suspended'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be: active, inactive, expired, or suspended'
            });
        }

        // Find the membership
        const membership = await membershipCollection.findOne({
            _id: new ObjectId(memberId),
            clubId: clubId
        });

        if (!membership) {
            return res.status(404).json({
                success: false,
                message: 'Member not found in this club'
            });
        }

        // Update the status
        const result = await membershipCollection.updateOne(
            { _id: new ObjectId(memberId) },
            { 
                $set: { 
                    status: status,
                    updatedAt: new Date()
                } 
            }
        );

        if (result.modifiedCount === 0) {
            return res.status(400).json({
                success: false,
                message: 'Failed to update member status'
            });
        }

        res.json({
            success: true,
            message: `Member status updated to ${status}`,
            updatedStatus: status
        });

    } catch (error) {
        console.error('Error updating member status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update member status'
        });
    }
});

// 3. Remove member from club (for club manager)
app.delete('/clubs/:clubId/members/:memberId', async (req, res) => {
    try {
        const { clubId, memberId } = req.params;

        // Find the membership
        const membership = await membershipCollection.findOne({
            _id: new ObjectId(memberId),
            clubId: clubId
        });

        if (!membership) {
            return res.status(404).json({
                success: false,
                message: 'Member not found in this club'
            });
        }

        // Delete the membership
        const result = await membershipCollection.deleteOne({
            _id: new ObjectId(memberId)
        });

        if (result.deletedCount === 0) {
            return res.status(400).json({
                success: false,
                message: 'Failed to remove member'
            });
        }

        // Update club members count
        await clubCollection.updateOne(
            { _id: new ObjectId(clubId) },
            { 
                $inc: { totalMembers: -1 },
                $pull: { 
                    members: { 
                        userEmail: membership.userEmail 
                    } 
                },
                $set: { updatedAt: new Date() }
            }
        );

        res.json({
            success: true,
            message: 'Member removed from club successfully'
        });

    } catch (error) {
        console.error('Error removing member:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove member'
        });
    }
});

// 4. Get membership statistics for a club (Optional)
app.get('/clubs/:clubId/members-stats', async (req, res) => {
    try {
        const { clubId } = req.params;

        const stats = await membershipCollection.aggregate([
            { $match: { clubId: clubId } },
            { $group: {
                _id: '$status',
                count: { $sum: 1 }
            }},
            { $project: {
                status: '$_id',
                count: 1,
                _id: 0
            }}
        ]).toArray();

        const totalMembers = stats.reduce((sum, item) => sum + item.count, 0);

        res.json({
            success: true,
            stats: stats,
            totalMembers: totalMembers
        });

    } catch (error) {
        console.error('Error fetching member stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch member statistics'
        });
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

// Create Stripe Checkout Session
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { userEmail, amount, clubId, clubName } = req.body;

        const session = await stripe.checkout.sessions.create({
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        unit_amount: amount * 100,
                        product_data: {
                            name: `${clubName} Membership`,
                        }
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            metadata: {
                userEmail: userEmail,
                clubId: clubId
            },
            customer_email: userEmail,
            success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&clubId=${clubId}`,
            cancel_url: `${process.env.FRONTEND_URL}/club/${clubId}`,
        });

        res.send({ url: session.url });

    } catch (error) {
        console.error('Stripe error:', error);
        res.status(500).send({ error: 'Payment failed' });
    }
});

// Verify Payment (PATCH request)
app.patch('/verify-payment', async (req, res) => {
    try {
        const sessionId = req.query.session_id;
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        const stripePaymentIntentId = session.payment_intent;

        // Check if payment already exists
        const paymentExist = await paymentCollection.findOne({
            stripePaymentIntentId: stripePaymentIntentId
        });

        if (paymentExist) {
            return res.send({
                success: true,
                message: 'Payment already processed',
                transactionId: stripePaymentIntentId,
            });
        }

        if (session.payment_status === 'paid') {
            const { userEmail, clubId } = session.metadata;

            // 1. Create payment record
            const payment = {
                userEmail: userEmail,
                amount: session.amount_total / 100,
                type: 'membership',
                clubId: clubId,
                stripePaymentIntentId: stripePaymentIntentId,
                status: 'completed',
                createdAt: new Date(),
                paidAt: new Date()
            };

            const resultPayment = await paymentCollection.insertOne(payment);

            // 2. Create membership
            const membershipResult = await membershipCollection.updateOne(
                {
                    userEmail: userEmail,
                    clubId: clubId
                },
                {
                    $set: {
                        userEmail: userEmail,
                        clubId: clubId,
                        status: 'active',
                        paymentId: stripePaymentIntentId,
                        joinedAt: new Date()
                    }
                },
                { upsert: true }
            );

            // 3. Update club members count
            await clubCollection.updateOne(
                { _id: new ObjectId(clubId) },
                {
                    $inc: { totalMembers: 1 },
                    $push: {
                        members: {
                            userEmail: userEmail,
                            joinedAt: new Date(),
                            membershipType: 'paid'
                        }
                    },
                    $set: { updatedAt: new Date() }
                }
            );

            return res.send({
                success: true,
                message: 'Payment successful and membership created',
                transactionId: stripePaymentIntentId,
                paymentInfo: resultPayment
            });
        }

        return res.send({
            success: false,
            message: 'Payment not completed',
            payment_status: session.payment_status
        });

    } catch (error) {
        console.error('Verify payment error:', error);
        res.status(500).send({
            success: false,
            error: 'Failed to verify payment',
            message: error.message
        });
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

// Get all events for AllEventsPage - ADD THIS
app.get('/events/all', async (req, res) => {
    try {
        const { limit = 50 } = req.query;

        // Get all events sorted by date
        const events = await eventCollection
            .find({})
            .sort({ eventDate: 1 })
            .limit(parseInt(limit))
            .toArray();

        res.json({
            success: true,
            events: events,
            count: events.length
        });
    } catch (error) {
        console.error('Error fetching all events:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch events',
            message: error.message
        });
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

// Get single event by ID - ADD THIS
app.get('/events/:id', async (req, res) => {
    try {
        const event = await eventCollection.findOne({
            _id: new ObjectId(req.params.id)
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        res.json({
            success: true,
            event: event
        });
    } catch (error) {
        console.error('Error fetching event:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch event',
            message: error.message
        });
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

/* =================================
    EVENT REGISTRATION APIs
=================================*/

// 1. Check if user can register for event
app.get('/events/:id/can-register', async (req, res) => {
    try {
        const { userEmail } = req.query;
        const eventId = req.params.id;

        // Step 1: Find the event
        const event = await eventCollection.findOne({
            _id: new ObjectId(eventId)
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        // Step 2: Check if user is club member
        const membership = await membershipCollection.findOne({
            clubId: event.clubId,
            userEmail: userEmail,
            status: 'active'
        });

        // Step 3: Check if already registered
        const existingRegistration = await eventRegistrationCollection.findOne({
            eventId: eventId,
            userEmail: userEmail,
            status: 'registered'
        });

        // Send response
        res.json({
            success: true,
            canRegister: !!membership && !existingRegistration,
            isClubMember: !!membership,
            alreadyRegistered: !!existingRegistration,
            event: {
                title: event.title,
                clubId: event.clubId
            }
        });

    } catch (error) {
        console.error('Error checking registration:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// 2. Register for event
app.post('/events/:id/register', async (req, res) => {
    try {
        const { userEmail } = req.body;
        const eventId = req.params.id;

        // Step 1: Find the event
        const event = await eventCollection.findOne({
            _id: new ObjectId(eventId)
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        // Step 2: Check if user is club member
        const membership = await membershipCollection.findOne({
            clubId: event.clubId,
            userEmail: userEmail,
            status: 'active'
        });

        if (!membership) {
            return res.status(400).json({
                success: false,
                message: 'You must be a club member to register for this event'
            });
        }

        // Step 3: Check if already registered
        const existing = await eventRegistrationCollection.findOne({
            eventId: eventId,
            userEmail: userEmail,
            status: 'registered'
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'You are already registered for this event'
            });
        }

        // Step 4: Create registration
        const registration = {
            eventId: eventId,
            userEmail: userEmail,
            clubId: event.clubId,
            status: 'registered',
            registeredAt: new Date()
        };

        await eventRegistrationCollection.insertOne(registration);

        // Step 5: Update event attendees count
        await eventCollection.updateOne(
            { _id: new ObjectId(eventId) },
            {
                $addToSet: { attendees: userEmail },
                $inc: { currentAttendees: 1 }
            }
        );

        res.json({
            success: true,
            message: 'Successfully registered for the event!'
        });

    } catch (error) {
        console.error('Error registering for event:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed'
        });
    }
});

// 3. Cancel registration
app.delete('/events/:id/cancel-registration', async (req, res) => {
    try {
        const { userEmail } = req.query;
        const eventId = req.params.id;

        // Remove registration
        const result = await eventRegistrationCollection.updateOne(
            {
                eventId: eventId,
                userEmail: userEmail,
                status: 'registered'
            },
            {
                $set: { status: 'cancelled' }
            }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Registration not found'
            });
        }

        // Remove from event attendees
        await eventCollection.updateOne(
            { _id: new ObjectId(eventId) },
            {
                $pull: { attendees: userEmail },
                $inc: { currentAttendees: -1 }
            }
        );

        res.json({
            success: true,
            message: 'Registration cancelled successfully'
        });

    } catch (error) {
        console.error('Error cancelling registration:', error);
        res.status(500).json({
            success: false,
            message: 'Cancellation failed'
        });
    }
});

/* ===========================================
    EVENT REGISTRATIONS - MANAGER'S DASHBOARD
===========================================*/

// 1. GET ALL Registrations for Manager's Clubs
app.get('/api/manager/events/registrations', async (req, res) => {
    try {
        const { managerEmail } = req.query; // URL: /api/manager/events/registrations?managerEmail=sojibff@gmail.com

        if (!managerEmail) {
            return res.status(400).json({
                success: false,
                message: 'Manager email is required'
            });
        }

        console.log(`📊 Fetching all event registrations for manager: ${managerEmail}`);

        // STEP 1: Find all clubs managed by this user
        const managedClubs = await clubCollection.find({
            managerEmail: managerEmail
        }).toArray();

        if (managedClubs.length === 0) {
            return res.json({
                success: true,
                message: 'You are not a manager of any club',
                events: [],
                registrations: []
            });
        }

        const managedClubIds = managedClubs.map(club => club._id.toString());
        console.log(`✅ Managed Clubs: ${managedClubIds.length}`);

        // STEP 2: Find all events in these clubs
        const events = await eventCollection.find({
            clubId: { $in: managedClubIds }
        }).sort({ eventDate: 1 }).toArray();

        console.log(`✅ Total Events in Clubs: ${events.length}`);
        const eventIds = events.map(event => event._id.toString());

        // STEP 3: Find ALL registrations for these events
        const allRegistrations = await eventRegistrationCollection
            .find({
                eventId: { $in: eventIds }
            })
            .sort({ registeredAt: -1 }) // সর্বশেষ রেজিস্ট্রেশন প্রথমে
            .toArray();

        console.log(`✅ Total Registrations Found: ${allRegistrations.length}`);

        // STEP 4: Enrich data for frontend
        const enrichedRegistrations = await Promise.all(
            allRegistrations.map(async (reg) => {
                // Find the event details for this registration
                const event = events.find(e => e._id.toString() === reg.eventId);
                // Find the club details
                const club = managedClubs.find(c => c._id.toString() === reg.clubId);

                return {
                    registrationId: reg._id,
                    userEmail: reg.userEmail,
                    status: reg.status, // 'registered' or 'cancelled'
                    registeredAt: reg.registeredAt,
                    // Event Details
                    eventId: reg.eventId,
                    eventTitle: event?.title || 'Event Not Found',
                    eventDate: event?.eventDate,
                    eventLocation: event?.location,
                    // Club Details
                    clubId: reg.clubId,
                    clubName: club?.clubName || 'Club Not Found',
                    clubManager: club?.managerEmail
                };
            })
        );

        // STEP 5: Prepare summary statistics
        const summary = {
            totalClubs: managedClubs.length,
            totalEvents: events.length,
            totalRegistrations: allRegistrations.length,
            activeRegistrations: allRegistrations.filter(r => r.status === 'registered').length,
            cancelledRegistrations: allRegistrations.filter(r => r.status === 'cancelled').length
        };

        res.json({
            success: true,
            summary: summary,
            managedClubs: managedClubs.map(c => ({ clubName: c.clubName, clubId: c._id })),
            registrations: enrichedRegistrations
        });

    } catch (error) {
        console.error('❌ Error fetching manager registrations:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
});

// 2. GET Registrations for a SPECIFIC Event (Manager Only)
app.get('/api/manager/events/:eventId/registrations', async (req, res) => {
    try {
        const eventId = req.params.eventId;
        const { managerEmail } = req.query;

        console.log(`🎯 Fetching registrations for event ${eventId} by manager ${managerEmail}`);

        // STEP 1: Find the event
        const event = await eventCollection.findOne({
            _id: new ObjectId(eventId)
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        // STEP 2: Find the club and verify manager
        const club = await clubCollection.findOne({
            _id: new ObjectId(event.clubId),
            managerEmail: managerEmail
        });

        if (!club) {
            return res.status(403).json({
                success: false,
                message: 'You are not the manager of this event\'s club'
            });
        }

        // STEP 3: Get registrations for this specific event
        const registrations = await eventRegistrationCollection
            .find({
                eventId: eventId
            })
            .sort({ registeredAt: -1 })
            .toArray();

        // Format as per requirement: userEmail, status, registeredAt
        const formattedRegistrations = registrations.map(reg => ({
            userEmail: reg.userEmail,
            status: reg.status,
            registeredAt: reg.registeredAt
        }));

        res.json({
            success: true,
            event: {
                title: event.title,
                clubName: club.clubName,
                eventDate: event.eventDate,
                location: event.location
            },
            registrations: formattedRegistrations,
            count: registrations.length
        });

    } catch (error) {
        console.error('❌ Error fetching event registrations:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});


/* ===========================================
    MANAGER DASHBOARD SUMMARY APIs
===========================================*/

// 1. Manager Dashboard Summary - FIXED
app.get('/api/manager/dashboard', async (req, res) => {
    try {
        const { managerEmail } = req.query;

        if (!managerEmail) {
            return res.status(400).json({
                success: false,
                message: 'Manager email is required'
            });
        }

        // STEP 1: Get clubs where user is MANAGER (created the club)
        const managedClubs = await clubCollection.find({
            managerEmail: managerEmail
        }).toArray();

        const managedClubIds = managedClubs.map(club => club._id.toString());

        // STEP 2: Basic stats
        const summary = {
            clubsManaged: managedClubIds.length,
            totalMembers: 0,
            totalEvents: 0,
            totalPayments: 0
        };

        if (managedClubIds.length === 0) {
            return res.json({ success: true, summary: summary });
        }

        // STEP 3: Get stats for MANAGER'S OWN CLUBS only
        summary.totalMembers = await membershipCollection.countDocuments({
            clubId: { $in: managedClubIds },
            status: 'active'
        });

        summary.totalEvents = await eventCollection.countDocuments({
            clubId: { $in: managedClubIds }
        });

        // STEP 4: FIXED - Get payments only from manager's own clubs
        const payments = await paymentCollection.find({
            clubId: { $in: managedClubIds },
            status: 'completed'
        }).toArray();

        // Manual sum
        summary.totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

        // STEP 5: Add club status info
        summary.activeClubs = managedClubs.filter(c => 
            c.status === 'active' || c.status === 'approved'
        ).length;
        
        summary.pendingClubs = managedClubs.filter(c => 
            c.status === 'pending'
        ).length;

        res.json({
            success: true,
            summary: summary
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// 2. Quick Stats - SIMPLIFIED
app.get('/api/manager/quick-stats', async (req, res) => {
    try {
        const { managerEmail } = req.query;
        if (!managerEmail) return res.status(400).json({ 
            success: false, 
            message: 'Manager email required' 
        });

        // Get manager's clubs
        const managedClubs = await clubCollection.find({
            managerEmail: managerEmail
        }).toArray();

        const managedClubIds = managedClubs.map(c => c._id.toString());

        // Quick calculations
        const stats = {
            clubsManaged: managedClubIds.length,
            totalMembers: 0,
            totalEvents: 0,
            totalPayments: 0
        };

        if (managedClubIds.length === 0) {
            return res.json({ success: true, ...stats });
        }

        // Get payments from manager's clubs
        const payments = await paymentCollection.find({
            clubId: { $in: managedClubIds },
            status: 'completed'
        }).toArray();

        stats.totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        stats.totalMembers = await membershipCollection.countDocuments({
            clubId: { $in: managedClubIds },
            status: 'active'
        });
        stats.totalEvents = await eventCollection.countDocuments({
            clubId: { $in: managedClubIds }
        });

        res.json({ success: true, ...stats });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/* ===========================
        SERVER
===========================*/

app.get('/', (req, res) => res.send("Club Sphere Server Running"));

app.listen(port, () =>
    console.log(`Club Sphere Server running at port ${port}`)
);