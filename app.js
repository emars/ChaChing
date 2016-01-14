/**
 * Module dependencies.
 */

var http = require('http')
  , express = require('express')
  , bodyParser = require('body-parser')
  , cookieParser = require('cookie-parser')
  , methodOverride = require('method-override')
  , expressSession = require('express-session')
  , WebSocketServer = require("ws").Server;

var app = module.exports = express();
var nodify = require('nodify-shopify');
 
var apiKey, secret; 

var shopifySession;

function AuthStorage(){
  this._auth = {};
}

AuthStorage.prototype.add = function(key, data){
  this._auth[key] = data;
};

AuthStorage.prototype.get = function(key){
  var data = this._auth[key];
  //delete this._auth[key];
  return data;
};

var authStorage = new AuthStorage();

//If Heroku or Foreman
 if(process.env.SHOPIFY_API_KEY != undefined && process.env.SHOPIFY_SECRET != undefined){
 	apiKey = process.env.SHOPIFY_API_KEY;
 	secret = process.env.SHOPIFY_SECRET;
}
else {
	var config = require ('./config.json');
	apiKey = config.apiKey;
 	secret = config.secret;
}

// Configuration
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(bodyParser.json()); // for parsing application/json
app.use(methodOverride());
app.use(cookieParser());
app.use(expressSession({ secret: "shhhhh!!!!",
    resave: true,
    saveUninitialized: false
 }));
//app.use(app.router);
app.use(express.static(__dirname + '/public'));

// Routes
app.get('/', function(req, res) {
	var shop = undefined, token = undefined;

	if(req.session.shopify){
		shop = req.session.shopify.shop;
		console.log('shop stored in user session:', shop);
    token = req.session.shopify.token 
	}

  if(req.query.shop){
		shop = req.query.shop.replace(".myshopify.com",'');
		console.log('shop given by query:', shop);
    token = req.session.shopify.token 
	}

	if(shop !== undefined && token != undefined) {
		shopifySession = nodify.createSession(shop, apiKey, secret, token);
		if(shopifySession.valid()){
			console.log('session is valid for <',shop,'>')

			shopifySession.order.all({limit: 5}, function(err, orders){
				console.log('orders:',orders);
				if(err) { throw err;}

				shopifySession.product.all({limit: 5}, function(err, products){
					console.log("products:", products);
					if(err) {  throw err;}

					res.render("index", {title: "ChaChing App", current_shop: shop , orders: orders, products: products});
				});

			});
		} 
	}
	else {
		console.log('session is not valid yet, we need some authentication !')
		if(shop !== undefined)
			res.redirect('/login/authenticate?shop='+shop);
		else
			res.redirect('/login')
	}
});


app.get('/login', function(req, res) {
	try {
		shop = res.body.shop;
	}
	catch(error) {
		shop = undefined;
	}

	if(req.session.shopify){
		res.redirect("/");
	}
	else if(shop != undefined) {
		//redirect to auth
		res.redirect("/login/authenticate");
	}
	else{
		res.render("login", {title: "Nodify App"});
	}
});

app.post('/login/authenticate', authenticate);
app.get( '/login/authenticate', authenticate);

function authenticate(req, res) {
	var shop = req.query.shop || req.body.shop;
	if(shop !== undefined && shop !== null) {	
	  console.log('creating a session for', shop, apiKey, secret)
		var shopifySession = nodify.createSession(shop, apiKey, secret, {
	    scope: {orders: "read", products: "read"},
	    uriForTemporaryToken: "http://"+req.headers.host+"/login/finalize/token",
	    onAskToken: function onToken (err, url) {
	    	res.redirect(url);
	    }
	  });
    console.log('ADDING AUTH STORE');
    authStorage.add(shop, shopifySession);
	}	else {
  	console.log('no shop, go login')
		res.redirect('/login');
	}
}

app.get('/login/finalize', function(req, res) {
  console.log('finalizing ...', req.query)
	params = req.query;
	req.session.shopify = params;
	params.onAskToken = function (err, url) {
		if(err) {
			res.send("Could not finalize");
			console.warn('Could not finalize login :', err)
		}
		res.redirect(url);
	}

	var shopifySession = nodify.createSession(req.query.shop, apiKey, secret, params);
	if(shopifySession.valid()){
		console.log('session is valid!')
		res.redirect("/");
	}
	else {
		res.send("Could not finalize");
	}
});

app.get('/login/finalize/token', function(req, res) {
	if(! req.query.code)
		return res.redirect("/login?error=Invalid%20connection.%20Please Retry")
  var shop = req.query.shop.replace('.myshopify.com', '');
  var shopifySession = authStorage.get(shop);

  if(! shopifySession) return res.send(400);
	shopifySession.requestPermanentAccessToken(req.query.code, function onPermanentAccessToken(token) {
		console.log('Authenticated on shop <', req.query.shop, '/', shopifySession.store_name, '> with token <', token, '>')
		//persistentKeys[shopifySession.store_name]=token;
		req.session.shopify = { shop:shopifySession.store_name, t: token };
		res.redirect('/app')
	})
})

app.get('/logout', function(req, res) {	
	if(req.session.shopify){
		req.session.shopify = null;
	}
	console.log('Logged out!')	
	res.redirect('/');
});

app.get('/plans', function(req, res) {	
	if(req.session.shopify){
		token = req.session.shopify.t
		shop = req.session.shopify.shop
	}

	if(shop !== undefined && token !== undefined) {
		res.render("plans", {title: "Nodify App Plans", current_shop: shop});
	}
	else {
		res.redirect('/login');
	}
});


app.get('/app', function(req, res) {	
  var token = undefined, shop = undefined;

  console.log(req.session.shopify);

	if(req.session.shopify){
		token = req.session.shopify.t
		shop = req.session.shopify.shop
	}

  console.log(token);
  console.log(shop);

	if(shop !== undefined && token !== undefined) {
		res.render("app", {title: "ChaChing App", current_shop: shop});
	}
	else {
		res.redirect('/login');
	}
});

app.get('/vendor', function(req, res){
  var shop = undefined, token = undefined;

	if(req.session.shopify){
		token = req.session.shopify.t
		shop = req.session.shopify.shop
	}

  if (! token || ! shop){
    return res.send(401);
  }

  var shopifySession = nodify.createSession(shop, apiKey, secret, token);

  shopifySession.shop.get(function(err, shop){
    if(err) return res.send(500);

    res.json(shop);
  }); 
});

// create webhook
app.post('/webhook', function(req, res){
  var shop = undefined, token = undefined;

	if(req.session.shopify){
		token = req.session.shopify.t
		shop = req.session.shopify.shop
	}

  if (! token || ! shop){
    return res.send(401);
  }

  var shopifySession = nodify.createSession(shop, apiKey, secret, token);

  shopifySession.webhook.all({}, function(err, webhooks){
    console.log(err);
    if (err) return res.send(500);

    console.log(webhooks);

    var webhook = webhooks.filter(function(webhook){
      return webhook.address === 'http://cha-ching-app.herokuapp.com/order';
    })[0];

    if(webhook){
      return res.send(200);
    }

    shopifySession.webhook.create({
      topic: 'orders/create',
      address: 'http://cha-ching-app.herokuapp.com/order',
      format: 'json'
    }, function(err, result){
      console.log(err);
      if (err) return res.send(500);
      res.send(200);
    });
  });
});


// respond to webhook
app.post('/order', function(req, res){
  console.log('NEW ORDER:');
  var vendor = req.body.vendor;
  console.log(vendor);

  var client = clients.filter(function(client){
    return client.vendor == vendor;
  })[0];

  if(client){
    client.send('test');
  }
  
  // send 200 response back to shopify
  res.send(200);
});


var port = process.env.PORT || 3000;


var server = http.createServer(app)

server.listen(port, function(){
	console.log("Running on: ", port);
});

var wss = new WebSocketServer({server: server})

console.log("websocket server created")

var clients = [];

wss.on("connection", function(ws) {
  console.log("websocket connection open")

  ws.on('message', function(data, flags){
    var json = JSON.parse(data);
    console.log(json);

    if(json.name){
      ws.vendor = json.vendor;
      clients.push(ws);
    }
  });

  ws.on("close", function() {
    console.log("websocket connection close")
    clients = clients.filter(function(client){
      client.shop != ws.shop;
    });
  })
})
