const express = require('express');
const bodyParser = require('body-parser');
const MongoClient = require('mongodb').MongoClient;
const app = express();
const jwt = require('jsonwebtoken');

// ========================
// Link to Database
// ========================
// Updates environment variables
// @see https://zellwk.com/blog/environment-variables/
require('./dotenv');

// Replace process.env.DB_URL with your actual connection string
const connectionString = process.env.DB_URL;
function generateJWTToken(data) {
  return jwt.sign(data, process.env.SECRET, {
    expiresIn: '7d', // expires in 24 hours
  });
}

function validateToken(req) {
  let token = req.headers['x-access-token'] || req.headers['authorization']; // Express headers are auto converted to lowercase
  if (token && token.startsWith('Bearer ')) {
    // Remove Bearer from string
    token = token.slice(7, token.length);
  }
  if (token) {
    return jwt.verify(token, process.env.SECRET, (err, decoded) => {
      if (err) {
        return true;
      } else {
        return false;
      }
    });
  } else {
    return true;
  }
}

MongoClient.connect(connectionString, { useUnifiedTopology: true })
  .then((client) => {
    console.log('Connected to Database');
    const db = client.db('star-wars-quotes');
    const quotesCollection = db.collection('quotes');
    const usersCollection = db.collection('users');

    // ========================
    // Middlewares
    // ========================
    app.set('view engine', 'ejs');
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());
    app.use(express.static('public'));

    // ========================
    // Routes
    // ========================
    app.post('/register', (req, res) => {
      usersCollection
        .insertOne(req.body)
        .then((result) => {
          // res.redirect('/')
          res.status(201).json({
            ok: true,
            message: 'Successfully created new user',
          });
        })
        .catch((error) => console.error(error));
    });

    app.post('/login', (req, res) => {
      const { username, password } = req.body;
      usersCollection
        .findOne({ username, password })
        .then((result) => {
          // res.redirect('/')
          const { _id, username } = result;
          let token = generateJWTToken({ _id, username });
          res.status(200).json({
            ok: true,
            message: 'Successfully login',
            data: result,
            token: token,
          });
        })
        .catch((error) => console.error(error));
    });

    app.get('/', (req, res) => {
      if (validateToken(req)) {
        return res.status(401).json({
          ok: false,
          message: 'User is not authorized',
        });
      }
      db.collection('quotes')
        .find()
        .toArray()
        .then((quotes) => {
          res.status(200).json({
            ok: true,
            message: 'Successfully fetched quotes',
            data: quotes,
          });
        })
        .catch((err) => {
          res.status(500).json({
            ok: true,
            message: 'Failed to fetch quotes',
            error: err,
          });
        });
    });

    app.post('/quotes', (req, res) => {
      if (validateToken(req)) {
        return res.status(401).json({
          ok: false,
          message: 'User is not authorized',
        });
      }
      quotesCollection
        .insertOne(req.body)
        .then((result) => {
          // res.redirect('/')
          res.status(201).json({
            ok: true,
            message: 'Successfully Added quote',
          });
        })
        .catch((error) =>
          res.status(400).json({
            ok: false,
            message: 'Failed to add quote',
            error: error,
          })
        );
    });

    app.put('/quotes/:name', (req, res) => {
      if (validateToken(req)) {
        return res.status(401).json({
          ok: false,
          message: 'User is not authorized',
        });
      }
      const { name } = req.params;
      quotesCollection
        .findOneAndUpdate(
          { name: name },
          {
            $set: {
              name: req.body.name,
              quote: req.body.quote,
            },
          },
          {
            upsert: true,
          }
        )
        .then((result) =>
          res.status(200).json({
            ok: true,
            message: 'Successfully Updated quote information',
            data: result.value,
          })
        )
        .catch((error) =>
          res.status(200).json({
            ok: false,
            message: 'Failed to upldate quote information',
            error: error,
          })
        );
    });

    app.delete('/quotes', (req, res) => {
      if (validateToken(req)) {
        return res.status(401).json({
          ok: false,
          message: 'User is not authorized',
        });
      }
      if (!req.body.name || req.body.name.trim() === '') {
        res.status(400).json({
          ok: false,
          message: 'Please add name in body',
        });
      }
      quotesCollection
        .deleteOne({ name: req.body.name })
        .then((result) => {
          if (result.deletedCount === 0) {
            return res.status(200).json({
              ok: true,
              message: 'No quote to delete',
            });
          }
          res.status(200).json({
            ok: true,
            message: 'Successfully deleted quote of ' + req.body.name,
          });
        })
        .catch((error) => console.error(error));
    });

    // ========================
    // Listen
    // ========================
    const isProduction = process.env.NODE_ENV === 'production';
    const port = isProduction ? 7500 : 3000;
    app.listen(port, function () {
      console.log(`listening on ${port}`);
    });
  })
  .catch(console.error);
