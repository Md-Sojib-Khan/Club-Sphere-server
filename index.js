const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;

// MongoDB connection
const uri = "mongodb+srv://007shojibkhan5:007shojibkhan5@cluster1.mhhrtuq.mongodb.net/?appName=Cluster1";
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

let userCollection, clubCollection;

async function run() {
    await client.connect();
    const db = client.db('club_sphere');
    userCollection = db.collection('users');
    clubCollection = db.collection('clubs');

    console.log("Connected to MongoDB");
}
run();

/* ===========================
       USERS APIs
===========================*/

// Get Users + Search
app.get('/users', async (req, res) => {
    const search = req.query.searchText;
    const query = search
        ? { $or: [{ displayName: new RegExp(search, "i") }, { email: new RegExp(search, "i") }] }
        : {};

    res.send(await userCollection.find(query).sort({ createdAt: -1 }).toArray());
});

// Get User Role
app.get('/users/:email/role', async (req, res) => {
    const user = await userCollection.findOne({ email: req.params.email });
    res.send({ role: user?.role || 'member' });
});

// Create User
app.post('/users', async (req, res) => {
    const user = req.body;
    const exists = await userCollection.findOne({ email: user.email });

    if (exists) return res.send({ message: 'user exists' });

    user.createdAt = new Date();
    res.send(await userCollection.insertOne(user));
});

// Update Role
app.patch('/users/:id/role', async (req, res) => {
    res.send(
        await userCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { role: req.body.role } }
        )
    );
});


/* ===========================
        CLUBS APIs
===========================*/

// Get clubs (managerEmail + status + search support)
app.get('/clubs', async (req, res) => {
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

    res.send(await clubCollection.find(query).sort({ createdAt: -1 }).toArray());
});

// Public Clubs
app.get('/clubs/all', async (req, res) => {
    const { category, limit = 20 } = req.query;
    let query = { status: { $in: ['approved', 'active'] } };
    if (category) query.category = category;

    res.send(
        await clubCollection.find(query).sort({ createdAt: -1 }).limit(parseInt(limit)).toArray()
    );
});

// Single club
app.get('/clubs/:id', async (req, res) => {
    const club = await clubCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!club) return res.status(404).send({ message: "Club not found" });

    res.send(club);
});

// Create club
app.post('/clubs', async (req, res) => {
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

    res.status(201).send(await clubCollection.insertOne(c));
});

// Update club
app.patch('/clubs/:id', async (req, res) => {
    const updateData = { ...req.body, updatedAt: new Date() };

    const result = await clubCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: updateData }
    );

    if (!result.matchedCount) return res.status(404).send({ message: "Club not found" });
    res.send(result);
});

// Update club status
app.patch('/clubs/:id/status', async (req, res) => {
    const { status } = req.body;
    const valid = ['pending', 'approved', 'rejected', 'active', 'inactive'];
    if (!valid.includes(status)) return res.status(400).send({ message: "Invalid status" });

    res.send(
        await clubCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { status, updatedAt: new Date() } }
        )
    );
});

// Delete club
app.delete('/clubs/:id', async (req, res) => {
    const result = await clubCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    if (!result.deletedCount) return res.status(404).send({ message: "Club not found" });

    res.send({ message: "Club deleted successfully" });
});

// Join club
app.patch('/clubs/:id/join', async (req, res) => {
    const { userId, userEmail } = req.body;
    if (!userId || !userEmail) return res.status(400).send({ message: "Missing user data" });

    const club = await clubCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!club) return res.status(404).send({ message: "Club not found" });

    if (club.members.some(m => m.userId === userId))
        return res.status(400).send({ message: "Already a member" });

    res.send(
        await clubCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            {
                $push: { members: { userId, userEmail, joinedAt: new Date() } },
                $inc: { totalMembers: 1 },
                $set: { updatedAt: new Date() }
            }
        )
    );
});

// Leave club
app.patch('/clubs/:id/leave', async (req, res) => {
    res.send(
        await clubCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            {
                $pull: { members: { userId: req.body.userId } },
                $inc: { totalMembers: -1 },
                $set: { updatedAt: new Date() }
            }
        )
    );
});

// Clubs by category
app.get('/clubs/category/:category', async (req, res) => {
    const regex = new RegExp(req.params.category, "i");
    res.send(
        await clubCollection.find({
            category: regex,
            status: { $in: ['approved', 'active'] }
        })
            .sort({ createdAt: -1 })
            .toArray()
    );
});

// Search clubs
app.get('/clubs/search/:keyword', async (req, res) => {
    const regex = new RegExp(req.params.keyword, "i");

    res.send(
        await clubCollection.find({
            $or: [
                { clubName: regex },
                { description: regex },
                { category: regex },
                { location: regex }
            ],
            status: { $in: ['approved', 'active'] }
        })
            .sort({ createdAt: -1 })
            .toArray()
    );
});

// Stats
app.get('/clubs-stats', async (req, res) => {
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
});


/* ===========================
        SERVER
===========================*/

app.get('/', (req, res) => res.send("Club Sphere Server Running"));

app.listen(port, () =>
    console.log(`Club Sphere Server running at port ${port}`)
);
