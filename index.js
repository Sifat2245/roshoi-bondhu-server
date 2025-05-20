const express = require('express');
const cors = require('cors');
const {MongoClient, ServerApiVersion} = require('mongodb');
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

