const express = require('express');
const cors = require('cors');
const {MongoClient, ServerApiVersion, ObjectId} = require('mongodb');
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


const run = async() =>{
    try{
        await client.connect()

        
        const recipeCollection = client.db('RoshoiBondhu').collection('AllRecipes')
        const userCollection = client.db('RoshoiBondhu').collection('Users')

        //posting data in db
        app.post('/AllRecipes', async(req, res) =>{
            const newRecipe = req.body;
            const result = await recipeCollection.insertOne(newRecipe)
            console.log(newRecipe);
            res.send(result)
        })

        // getting data
        app.get('/AllRecipes', async(req, res) =>{
            const result = await recipeCollection.find().toArray()
            res.send(result)
        })

        //getting data by id
        app.get('/AllRecipes/:id', async(req, res) =>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const result = await recipeCollection.findOne(query)
            res.send(result)
        })


        await client.db('admin').command({ping: 1})
        console.log('connected');
    }
    finally{

    }
}

run().catch(console.dir)


app.get('/', (req,res) =>{
    res.send('Welcome To RoshoiBondhu DataBase')
})

app.listen(port, () =>{
    console.log(`the sever is running on port ${port}`);
})

