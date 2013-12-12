// Copyright Peter Širka, Web Site Design s.r.o. (www.petersirka.sk)
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var urlParser = require('url');
var https = require('https');
var querystring = require('querystring');

function Paypal(username, password, signature, returnUrl, cancelUrl, debug) {

	this.username = username;
	this.password = password;
	this.signature = signature;
	this.debug = debug || false;
	this.returnUrl = returnUrl;
	this.cancelUrl = cancelUrl;

	this.url = 'https://' + (debug ? 'api-3t.sandbox.paypal.com' : 'api-3t.paypal.com') + '/nvp';
	this.redirect = 'https://' + (debug ? 'www.sandbox.paypal.com/cgi-bin/webscr' : 'www.paypal.com/cgi-bin/webscr');
};

Paypal.prototype.params = function() {
	var self = this;
	return {
		USER: self.username,
		PWD: self.password,
		SIGNATURE: self.signature,
		VERSION: '52.0'		
	};
};

/*
	Get payment detail
	@token {String}
	@payer {String} :: PayerID
	@callback {Function} :: callback(err, data, invoiceNumber, price);
	return {Paypal}
*/
Paypal.prototype.detail = function(token, payer, callback) {

	if (typeof(token.get) !== 'undefined' && typeof(payer) === 'function') {
		callback = payer;
		payer = token.get.PayerID;
		token = token.get.token;
	}

	var self = this;
	var params = self.params();

	params.TOKEN = token;
	params.METHOD = 'GetExpressCheckoutDetails';

	self.request(self.url, 'POST', params, function(err, data) {

		if (err) {
			callback(err, data);
			return;
		}		

		if (typeof(data.CUSTOM) === 'undefined') {
			callback(data, null);
			return;
		}

		var custom = data.CUSTOM.split('|');
		var details = data;
		
		var params = self.params();
		params.PAYMENTACTION = 'Sale';
		params.PAYERID = payer;
		params.TOKEN = token;
		params.AMT = custom[1];
		params.CURRENCYCODE = custom[2];
		params.METHOD = 'DoExpressCheckoutPayment';

		self.request(self.url, 'POST', params, function(err, data) {
			data.details = details;

			if (err) {
				callback(err, data);
				return;
			}

			callback(null, data, custom[0], custom[1]);
		});
	});

	return self;	
};

/*
	Get payment detail
	@invoiceNumber {String}
	@amount {Number}
	@description {String}
	@currency {String} :: EUR, USD
	@callback {Function} :: callback(err, url);
	return {Paypal}
*/
Paypal.prototype.pay = function(invoiceNumber, amount, opts, callback) {

	var self = this;
	var params = self.params();

	params.PAYMENTACTION = 'Sale';
	params.AMT           = prepareNumber(amount);
	params.RETURNURL     = self.returnUrl;
	params.CANCELURL     = self.cancelUrl;
	params.DESC          = opts.DESC;
	params.NOSHIPPING    = opts.NOSHIPPING || 1;
	params.ALLOWNOTE     = 1;
	params.CURRENCYCODE  = opts.CURRENCYCODE || 'USD';
	params.METHOD        = 'SetExpressCheckout';
	params.INVNUM        = invoiceNumber;
	params.CUSTOM        = invoiceNumber + '|' + params.AMT + '|' + params.CURRENCYCODE;
	if(opts.LOGOIMG) params.LOGOIMG = opts.LOGOIMG;

	self.request(self.url, 'POST', params, function(err, data) {

		if (err) {
			callback(err, null);
			return;
		}

		if (data.ACK === 'Success') {
			callback(null, self.redirect + '?cmd=_express-checkout&useraction=commit&token=' + data.TOKEN);
			return;
		}

		callback(new Error('ACK ' + data.ACK + ': ' + data.L_LONGMESSAGE0), null);
	});

	return self;
};

/*
	Internal function
	@url {String}
	@method {String}
	@data {String}
	@callback {Function} :: callback(err, data);
	return {Paypal}
*/
Paypal.prototype.request = function(url, method, data, callback) {

	var self = this;
	var params = querystring.stringify(data);

	if (method === 'GET')
		url += '?' + params;

	var uri = urlParser.parse(url);
	var headers = {};

	headers['Content-Type'] = method === 'POST' ? 'application/x-www-form-urlencoded' : 'text/plain';
	headers['Content-Length'] = params.length;

	var location = '';
	var options = { protocol: uri.protocol, auth: uri.auth, method: method || 'GET', hostname: uri.hostname, port: uri.port, path: uri.path, agent: false, headers: headers };

	var response = function (res) {
		var buffer = '';

		res.on('data', function(chunk) {
			buffer += chunk.toString('utf8');
		})

		req.setTimeout(exports.timeout, function() {
			callback(new Error('timeout'), null);
		});

		res.on('end', function() {
			
			var error = null;
			var data = '';

			if (res.statusCode > 200) {
				error = new Error(res.statusCode);
				data = buffer;
			} else	
				data = querystring.parse(buffer);

			callback(error, data);
		});
	};

	var req = https.request(options, response);

	if (method === 'POST')
		req.end(params);
	else
		req.end();

	return self;
};

function prepareNumber(num, doubleZero) {
	var str = num.toString().replace(',', '.');

	var index = str.indexOf('.');
	if (index > -1) {
		var len = str.substring(index + 1).length;
		if (len === 1)
			str += '0';
		if (len > 2)
			str = str.substring(0, index + 3);
	} else {
		if (doubleZero || true)
			str += '.00';
	}
	return str;
}

exports.version = 1003;
exports.Paypal = Paypal;
exports.init = function(username, password, signature, returnUrl, cancelUrl, debug) {
	return new Paypal(username, password, signature, returnUrl, cancelUrl, debug);
}; 
