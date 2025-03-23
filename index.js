const express = require('express');
const axios = require('axios');
require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
    tls: true,  // Enable TLS
    tlsAllowInvalidCertificates: false  // Ensure valid certificates
});

const app = express();
app.use(express.json());

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

let db;
let messagesCollection;

async function sendMessage(to, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/v22.0/${PHONE_ID}/messages`,
            {
                messaging_product: 'whatsapp',
                to: to,
                text: { body: text },
            },
            { headers: { Authorization: `Bearer ${TOKEN}` } }
        );
        console.log('Initial message sent to user');
    } catch (error) {
        console.error("Error sending message: ", error);
    }
}

async function connectDB() {
    try {
        await client.connect();
        db = client.db('whatsappBot');
        messagesCollection = db.collection('messages');
        console.log('Connected to MongoDB');
        await sendMessage("+393476789701", "Bot connected to MongoDB and ready to receive messages!");
    } catch (error) {
        console.error("Error connecting to MongoDB: ", error);
    }
}

// This is the function that stores a message in MongoDB
async function storeMessage(message) {
    try {
        const result = await messagesCollection.insertOne({
            phoneNumber: message.from,  // Assuming 'from' is the sender's phone number
            text: message.text.body,    // Assuming 'text.body' is the message content
            timestamp: new Date()       // Timestamp for the message
        });

        console.log(`Message stored with id: ${result.insertedId}`);
    } catch (error) {
        console.error("Error storing message: ", error);
    }
}

app.get('/webhook', (req, res) => {
    console.log('Webhook verification request received');
    // This is the webhook verification process
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);
        console.log('Webhook verified');
    } else {
        res.send('Verification failed');
        console.error('Webhook verification failed');
    }
});

app.post('/webhook', async (req, res) => {
    try {
        console.log('Webhook POST request received');
        // console.log('Request body:', JSON.stringify(req.body, null, 2));

        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;

        if (value?.messages) {
            const message = value.messages[0];
            console.log('Incoming message:', message);

            // Store the message in MongoDB
            await storeMessage(message);

            // Respond to the WhatsApp API (e.g., send a reply)
            const phone = message.from;
            const responseText = `You said: ${message.text.body}`;

            await axios.post(
                `https://graph.facebook.com/v22.0/${PHONE_ID}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: phone,
                    text: { body: responseText },
                },
                { headers: { Authorization: `Bearer ${TOKEN}` } }
            );
            console.log('Response sent to user');
        } else if (value?.statuses) {
            const status = value.statuses[0];
            console.log('Message status update:', status);
        } else {
            console.log('No message or status data found');
            console.log('Request body:', JSON.stringify(req.body, null, 2));
        }
        res.sendStatus(200);
    } catch (error) {
        console.error("Error handling incoming message: ", error);
        res.sendStatus(500);
    }
});

// Start the server and connect to MongoDB
app.listen(3000, async () => {
    console.log('Bot is running on port 3000');
    await connectDB();  // Initialize DB connection when server starts
});