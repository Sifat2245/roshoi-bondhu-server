const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const app = express()
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.qwhtqkb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
    }
});


const run = async () => {
    try {
        // await client.connect()


        const recipeCollection = client.db('RoshoiBondhu').collection('AllRecipes')
        const userCollection = client.db('RoshoiBondhu').collection('Users')

        //posting data in db
        app.post('/AllRecipes', async (req, res) => {
            const newRecipe = req.body;
            const result = await recipeCollection.insertOne(newRecipe)
            // console.log(newRecipe);
            res.send(result)
        })

        // getting data
        app.get('/AllRecipes', async (req, res) => {
            const result = await recipeCollection.find().toArray()
            res.send(result)
        })

        //getting top recipes
        app.get('/top-recipes', async (req, res) => {
            const result = await recipeCollection
                .find()
                .sort({ likeCount: -1 })
                .limit(8)
                .toArray()

            res.send(result)
        })



        //getting data by id
        app.get('/AllRecipes/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await recipeCollection.findOne(query)
            res.send(result)
        })

        //getting data by email
        app.get('/AllRecipe/:email', async (req, res) => {
            const email = req.params.email;
            const query = { userEmail: email }
            const result = await recipeCollection.find(query).toArray()
            res.send(result)
        })

        //updating post data

        app.put('/AllRecipes/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true };
            const UpdatedRecipe = req.body;
            const updatedDoc = {
                $set: UpdatedRecipe
            }

            const result = await recipeCollection.updateOne(filter, updatedDoc, options)
            res.send(result)
        })

        //updating like count
        app.put('/AllRecipes/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updatedLikeCount = req.body
            const updatedDoc = {
                $set: updatedLikeCount
            }

            const result = await recipeCollection.updateOne(filter, updatedDoc, options)
            res.send(result)

        })

        // delete post
        app.delete('/AllRecipes/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await recipeCollection.deleteOne(query)
            res.send(result)
        })



        //users api
        app.post('/users', async (req, res) => {
            const newUser = req.body;
            const result = await userCollection.insertOne(newUser)
            res.send(result)
        })

        // get user data as json
        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray()
            res.send(result)
        })


        // await client.db('admin').command({ ping: 1 })
        // console.log('connected');
    }
    finally {


    }
}

run().catch(console.dir)


app.get('/', (req, res) => {
    res.send('Welcome To RoshoiBondhu DataBase')
})

app.listen(port, () => {
    console.log(port);
})

