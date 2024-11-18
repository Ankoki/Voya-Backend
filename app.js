var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

const {MongoClient} = require('mongodb');
require('dotenv').config();

const mongoUrl = process.env.MONGO_URL;
const voyaToken = process.env.VOYA_AUTH_TOKEN;

function validateHeader(req, res) {
    if (!req.headers.authorization) {
        res.status(403).json({error: 'No auth token sent.'});
        return false;
    } else if (!req.headers.authorization === voyaToken) {
        res.status(401).json({error: 'Incorrect auth token.'});
        return false;
    }
    return true;
}

// AUTH
app.get('/is-available', async (req, res) => {
    if (!validateHeader(req, res))
        return;
    const client = new MongoClient(mongoUrl);
    try {
        await client.connect();
        const database = client.db('voyadb');
        const collection = database.collection('userdata');
        const users = await collection.find({'username': req.headers.username}).toArray();
        const available = users.length === 0;
        console.log('Username ' + req.headers.username + ' is ' + (available ? 'available ' : 'taken ') + '.');
        res.status(200).json( { available: available } );
    } catch (error) {
        console.error('Error checking availability:', error);
        res.status(500).json({ error_code: 500, error: error });
    } finally {
        await client.close();
    }
});

// USERDATA
app.get('/fetch-userdata', async (req, res) => {
    if (!validateHeader(req, res))
        return;
    const client = new MongoClient(mongoUrl);
    try {
        await client.connect();
        const database = client.db('voyadb');
        const collection = database.collection('userdata');
        const uuid = req.headers.uuid;
        const filter = { uuid: uuid };
        const user = await collection.find(filter).toArray();
        console.log('Fetched userdata for ' + uuid + ':', user);
        res.status(200).json(user);
    } catch (error) {
        console.error('Error fetching userdata:', error);
        res.status(500).json({ error_code: 500, error: error });
    } finally {
        await client.close();
    }
});

app.post('/push-userdata', async (req, res) => {
    if (!validateHeader(req, res))
        return;
    const client = new MongoClient(mongoUrl);
    try {
        await client.connect();
        const database = client.db('voyadb');
        const collection = database.collection('userdata');
        const key = Object.keys(req.body)[0];
        let result = await collection.replaceOne({'username': key}, req.body[key], {upsert: true});
        res.status(200).json({ response: result });
    } catch (error) {
        console.error('Error pushing userdata:', error);
        res.status(500).json({ error_code: 500, error: error });
    } finally {
        await client.close();
    }
});

// BOOKDATA
app.get('/fetch-bookdata', async (req, res) => {
    if (!validateHeader(req, res))
        return;
    const client = new MongoClient(mongoUrl);
    try {
        await client.connect();
        const database = client.db('voyadb');
        const collection = database.collection('bookdata');
        const uuid = req.headers.uuid;
        const filter = { uuid: uuid };
        const bookdata = await collection.find(filter).toArray();
        console.log('Fetched bookdata:', bookdata);
        res.status(200).json(bookdata);
    } catch (error) {
        console.error('Error fetching bookdata:', error);
        res.status(500).json({ error_code: 500, error: error });
    } finally {
        await client.close();
    }
});

app.get('/fetch-user-bookdata', async (req, res) => {
    if (!validateHeader(req, res))
        return;
    const client = new MongoClient(mongoUrl);
    try {
        await client.connect();
        const database = client.db('voyadb');
        const collection = database.collection('bookdata');
        const user = req.headers.user;
        const filter = {
            $or: [
                {admins: user},
                {viewer: user}
            ]
        };
        const userdata = await collection.find(filter).toArray();
        console.log('Fetched bookdata for ' + user + ': ', userdata);
        res.status(200).json(userdata);
    } catch (error) {
        console.error('Error fetching bookdata:', error);
        res.status(500).json({ error_code: 500, error: error });
    } finally {
        await client.close();
    }
});

app.post('/push-bookdata', async (req, res) => {
    if (!validateHeader(req, res))
        return;
    const client = new MongoClient(mongoUrl);
    try {
        await client.connect();
        const database = client.db('voyadb');
        const collection = database.collection('bookdata');
        const key = Object.keys(req.body)[0];
        let result = await collection.replaceOne({'uuid': key}, req.body[key], {upsert: true});
        res.status(200).send(result);
    } catch (error) {
        console.error('Error pushing bookdata:', error);
        res.status(500).json({ error_code: 500, error: error });
    } finally {
        await client.close();
    }
});

// UUID Username Bridge
app.get('/get-uuid-from-username', async (req, res) => {
    if (!validateHeader(req, res))
        return;
    const client = new MongoClient(mongoUrl);
    try {
        await client.connect();
        const database = client.db('voyadb');
        const collection = database.collection('uuidmap');
        const username = req.headers.username;
        console.log(username);
        const uuid = await collection.findOne({ key: username });
        console.log('Fetched UUID[' + uuid[username] + '] for username[' + username + ']');
        res.status(200).json({ uuid: uuid[username] });
    } catch (error) {
        console.error('Error fetching UUID:', error);
        res.status(500).json({ error_code: 500, error: error });
    } finally {
        await client.close();
    }
});

app.post('/update-uuid-username', async (req, res) => {
    if (!validateHeader(req, res))
        return;
    const client = new MongoClient(mongoUrl);
    try {
        await client.connect();
        const database = client.db('voyadb');
        const collection = database.collection('uuidmap');
        const key = Object.keys(req.body)[0];
        let json = new Map();
        json.set(key, req.body[key]);
        let result = await collection.findOneAndUpdate({ key }, {$set: json}, { upsert: true });
        res.status(200).json({ message: 'Username updated successfully.', result});
    } catch (error) {
        res.status(500).json({ error_code: 500, error: error });
    } finally {
        await client.close();
    }
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;

