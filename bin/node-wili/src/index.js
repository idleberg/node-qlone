"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fetch = require("isomorphic-fetch");
var checkStatus = function (response) {
    if (response.status >= 200 && response.status < 300) {
        return Promise.resolve(response);
    }
    else {
        return Promise.reject(new Error(response.statusText));
    }
};
var parseJson = function (response) {
    return response.json();
};
var buildUrl = function (key, input) {
    if (Array.isArray(input)) {
        var reqUrl_1 = '';
        input.forEach(function (r) {
            r = (typeof r === 'string') ? r.toUpperCase() : r;
            reqUrl_1 += "&" + key + "=" + r;
        });
        return reqUrl_1;
    }
    return "&" + key + "=" + input;
};
var callAPI = function (url) {
    return fetch(url)
        .then(checkStatus)
        .then(parseJson)
        .then(function (response) {
        return response.data;
    }).catch(function (error) {
        console.error(error);
    });
};
var WienerLinien = (function () {
    function WienerLinien(API_KEY) {
        if (API_KEY === void 0) { API_KEY = process.env.WIENER_LINIEN_API_KEY; }
        this.API_KEY = API_KEY;
        this.baseUrl = 'https://www.wienerlinien.at/ogd_realtime';
    }
    WienerLinien.prototype.monitor = function (rbl, options) {
        if (options === void 0) { options = {}; }
        this.reqUrl = this.baseUrl + "/monitor?sender=" + this.API_KEY;
        this.reqUrl += buildUrl('rbl', rbl);
        if (typeof options.activateTrafficInfo !== 'undefined' && options.activateTrafficInfo) {
            this.reqUrl += buildUrl('activateTrafficInfo', options.activateTrafficInfo);
        }
        return callAPI(this.reqUrl);
    };
    WienerLinien.prototype.newsList = function (options) {
        if (options === void 0) { options = {}; }
        this.reqUrl = this.baseUrl + "/newsList?sender=" + this.API_KEY;
        if (typeof options.relatedLine !== 'undefined' && options.relatedLine) {
            this.reqUrl += buildUrl('relatedLine', options.relatedLine);
        }
        if (typeof options.relatedStop !== 'undefined' && options.relatedStop) {
            this.reqUrl += buildUrl('relatedStop', options.relatedStop);
        }
        if (typeof options.name !== 'undefined' && options.name) {
            this.reqUrl += buildUrl('name', options.name);
        }
        return callAPI(this.reqUrl);
    };
    WienerLinien.prototype.trafficInfoList = function (options) {
        if (options === void 0) { options = {}; }
        this.reqUrl = this.baseUrl + "/trafficInfoList?sender=" + this.API_KEY;
        if (typeof options.relatedLine !== 'undefined' && options.relatedLine) {
            this.reqUrl += buildUrl('relatedLine', options.relatedLine);
        }
        if (typeof options.relatedStop !== 'undefined' && options.relatedStop) {
            this.reqUrl += buildUrl('relatedStop', options.relatedStop);
        }
        if (typeof options.name !== 'undefined' && options.name) {
            this.reqUrl += buildUrl('name', options.name);
        }
        return callAPI(this.reqUrl);
    };
    return WienerLinien;
}());
exports.default = WienerLinien;
//# sourceMappingURL=index.js.map