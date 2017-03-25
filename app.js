var app = require('express')();
var responseTime = require('response-time');
var axios = require('axios');
var redis = require('redis');
var mongoose = require('mongoose');

var user = process.env.MODULUS_USER;
var password = process.env.MODULUS_PASSWORD;

var db = mongoose.connection;

db.once('open', function () {
    console.log('Connection success');
});

mongoose.connect('mongodb://' + user + ':' + password + '@olympia.modulusmongo.net:27017/ividE2go');

var LogSchema = new mongoose.Schema({
    text: String,
    time: Date
});

var redisClient = redis.createClient();

redisClient.on('connect', function () {
    var Log = mongoose.model('Log', LogSchema);
    Log.create({
        text: 'Bağlantı başarılı',
        time: new Date()
    }, function (err) {
        console.log('Error : ' + err);
    });
});

app.set('port', process.env.PORT || 5000);

app.use(responseTime());


function getUserRepositories(user) {
    var githubEndpoint = 'https://api.github.com/users/' + user + '/repos' + '?per_page=100';
    return axios.get(githubEndpoint);
}

function computeTotalStars(repositories) {
    return repositories.data.reduce(function (prev, curr) {
        return prev + curr.stargazers_count
    }, 0);
}

app.get('/api/:username', function (req, res) {
    var userName = req.params.username;

    redisClient.get(userName, function (error, result) {
        if (result) {
            res.send({
                totalStars: result,
                source: 'redis cache'
            });
        } else {
            getUserRepositories(userName).then(computeTotalStars).then(function (totalStars) {
                redisClient.setex(userName, 60, totalStars);
                res.send({
                    totalStars: totalStars,
                    source: 'Github API'
                });
            }).catch(function (response) {
                if (response.status === 404) {
                    res.send('The GitHub username could not be found. Try "coligo-io" as an example!');
                } else {
                    res.send(response);
                }
            });
        }
    });
});

app.listen(app.get('port'), function () {
    console.log('Server listening on port : ' + app.get('port'));
});