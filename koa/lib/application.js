
'use strict';

/**
 * Module dependencies.
 */
// 正则判断当前传入的 function 是否是标准的 generator 函数
const isGeneratorFunction = require('is-generator-function');
const debug = require('debug')('koa:application');
const onFinished = require('on-finished');
const response = require('./response');
const compose = require('koa-compose');
const context = require('./context');
const request = require('./request');
const statuses = require('statuses');
// Node 的 event 模块
const Emitter = require('events');
// Node 的 util 模块
const util = require('util');
// Node 的 stream 模块
const Stream = require('stream');
// Node 的 http 模块
const http = require('http');
const only = require('only');
const convert = require('koa-convert');
const deprecate = require('depd')('koa');
const { HttpError } = require('http-errors');

/**
 * Expose `Application` class.
 * Inherits from `Emitter.prototype`.
 */
// 继承了 Node 的 Emitter 类: 
// 这个类可以直接为自定义事件注册回调函数和触发事件，同时可以捕捉到其他地方触发的事件
module.exports = class Application extends Emitter {
  /**
   * Initialize a new `Application`.
   *
   * @api public
   */

  /**
    *
    * @param {object} [options] Application options
    * @param {string} [options.env='development'] Environment
    * @param {string[]} [options.keys] Signed cookie keys
    * @param {boolean} [options.proxy] Trust proxy headers
    * @param {number} [options.subdomainOffset] Subdomain offset
    * @param {boolean} [options.proxyIpHeader] proxy ip header, default to X-Forwarded-For
    * @param {boolean} [options.maxIpsCount] max ips read from proxy ip header, default to 0 (means infinity)
    *
    */
  // new Koa 做的一些初始化操作
  constructor(options) {
    super();
    options = options || {};
    this.proxy = options.proxy || false;
    this.subdomainOffset = options.subdomainOffset || 2;
    this.proxyIpHeader = options.proxyIpHeader || 'X-Forwarded-For';
    this.maxIpsCount = options.maxIpsCount || 0;
    this.env = options.env || process.env.NODE_ENV || 'development';
    if (options.keys) this.keys = options.keys;

    // 存放通过 app.use 注册的中间件
    this.middleware = [];
    // 基于 content.js 创建 this.context
    this.context = Object.create(context);
    // 基于 request.js 创建 this.request
    this.request = Object.create(request);
    // 基于 response.js 创建 this.response
    this.response = Object.create(response);

    // util.inspect.custom support for node 6+
    /* istanbul ignore else */
    if (util.inspect.custom) {
      this[util.inspect.custom] = this.inspect;
    }
  }

  /**
   * Shorthand for:
   *
   *    http.createServer(app.callback()).listen(...)
   *
   * @param {Mixed} ...
   * @return {Server}
   * @api public
   */

  // app.listen 就是执行的这个方法
  // 这个方法的本质就是使用 Node 的 http 模块创建一个服务并启动
  listen(...args) {
    debug('listen');
    // 通过 Node 的 http 模块创建一个服务并启动
    const server = http.createServer(this.callback());
    return server.listen(...args);
  }

  /**
   * Return JSON representation.
   * We only bother showing settings.
   *
   * @return {Object}
   * @api public
   */

  toJSON() {
    return only(this, [
      'subdomainOffset',
      'proxy',
      'env'
    ]);
  }

  /**
   * Inspect implementation.
   *
   * @return {Object}
   * @api public
   */

  inspect() {
    return this.toJSON();
  }

  /**
   * Use the given middleware `fn`.
   *
   * Old-style middleware will be converted.
   *
   * @param {Function} fn
   * @return {Application} self
   * @api public
   */
  /*添加中间件, 中间件调用方法: 
    // 1、koa1
    app.use(function* (ctx, next) { 
      ctx.test = '123';
      yield next;
    });
    // 2、koa2
    app.use(async function(ctx, next) { 
      ctx.test = '123';
      next();
    });
  */
  use(fn) {
    // 判断传进来的中间件是不是函数，不是，报错
    if (typeof fn !== 'function') throw new TypeError('middleware must be a function!');
    // 如果 fn 是 Generator 函数，说明当前是 koa1 框架，将其转换为 koa2 函数
    if (isGeneratorFunction(fn)) {
      // 提示新版本新版本不用 generator 函数，改为 async 函数了
      deprecate('Support for generators will be removed in v3. ' +
                'See the documentation for examples of how to convert old middleware ' +
                'https://github.com/koajs/koa/blob/master/docs/migration.md');
      // 兼容旧版本 koa 中间件：利用 koa-convert(co) 库
      fn = convert(fn);
    }
    debug('use %s', fn._name || fn.name || '-');
    // 将中间件函数放进 this.middleware 数组
    this.middleware.push(fn);
    // 将当前实例返回，用来支持链式调用
    return this;
  }

  /**
   * Return a request handler callback
   * for node's native http server.
   *
   * @return {Function}
   * @api public
   */

  callback() {
    // const compose = require('koa-compose')，compose 使用的是第三方库
    // 通过 compose 组合所有的中间件
    // compose 接收中间还能数组，返回一个函数，这个函数是 promise
    const fn = compose(this.middleware);

    // 用来监听错误
    if (!this.listenerCount('error')) this.on('error', this.onerror);

    const handleRequest = (req, res) => {
      // 通过 this.createContext 得到 ctx 上下文
      const ctx = this.createContext(req, res);
      // 执行 handleRequest 其实真正执行的是 this.handleRequest
      return this.handleRequest(ctx, fn);
    };

    // 返回 handleRequest 函数用于 http.createServer 回调
    // http.createServer((req, res) => {})
    return handleRequest;
  }

  /**
   * Handle request in callback.
   *
   * @api private
   */
  // 执行 http.createServer 的回调实际上执行的是这个
  // 接收两个参数：
  //   一个是 ctx 上下文
  //   另外一个参数是：执行 compose(this.middleware) 得到的 fn-->fnMiddleware
  handleRequest(ctx, fnMiddleware) {
    const res = ctx.res;
    res.statusCode = 404;
    const onerror = err => ctx.onerror(err);
    const handleResponse = () => respond(ctx);
    onFinished(res, onerror);

    /**
     * 执行 fnMiddleware 得到一个 promise
     *   const fn = compose(this.middleware);
     *   this.handleRequest(ctx, fn); 
     * 
     * handleResponse 处理响应
     */
    /**
     * catch(onerror) 捕捉错误：
     *   在 koa 中统一处理错误，只需要让 koa 实例监听 onerror 事件就可以了
     *   app.on('error', err => {
     *     log.error('server error', err)
     *   })
     * 
     * 结合 koa-compose 来看看 koa 如何做到集中处理所有中间件的错误
     *   中间件的 async 函数返回一个 Promise 对象
     *   async 函数内部抛出错误，Promise 对象变为 reject 状态。抛出的错误会被 catch 的回调函数 onerror 捕获到
     *   await 命令后面的 Promise 对象如果变为 reject 状态， 也可以被 catch 的回调函数 onerror 捕获到
     */
    return fnMiddleware(ctx).then(handleResponse).catch(onerror);
  }

  /**
   * Initialize a new context.
   *
   * @api private
   */

  createContext(req, res) {
    const context = Object.create(this.context);
    const request = context.request = Object.create(this.request);
    const response = context.response = Object.create(this.response);
    context.app = request.app = response.app = this;
    context.req = request.req = response.req = req;
    context.res = request.res = response.res = res;
    request.ctx = response.ctx = context;
    request.response = response;
    response.request = request;
    context.originalUrl = request.originalUrl = req.url;
    context.state = {};
    return context;
  }

  /**
   * Default error handler.
   *
   * @param {Error} err
   * @api private
   */

  onerror(err) {
    // When dealing with cross-globals a normal `instanceof` check doesn't work properly.
    // See https://github.com/koajs/koa/issues/1466
    // We can probably remove it once jest fixes https://github.com/facebook/jest/issues/2549.
    const isNativeError =
      Object.prototype.toString.call(err) === '[object Error]' ||
      err instanceof Error;
    if (!isNativeError) throw new TypeError(util.format('non-error thrown: %j', err));

    if (404 === err.status || err.expose) return;
    if (this.silent) return;

    const msg = err.stack || err.toString();
    console.error(`\n${msg.replace(/^/gm, '  ')}\n`);
  }

  /**
   * Help TS users comply to CommonJS, ESM, bundler mismatch.
   * @see https://github.com/koajs/koa/issues/1513
   */

  static get default() {
    return Application;
  }
};

/**
 * Response helper.
 */

function respond(ctx) {
  // allow bypassing koa
  if (false === ctx.respond) return;

  if (!ctx.writable) return;

  const res = ctx.res;
  let body = ctx.body;
  const code = ctx.status;

  // ignore body
  if (statuses.empty[code]) {
    // strip headers
    ctx.body = null;
    return res.end();
  }

  // 处理HEAD 请求
  if ('HEAD' === ctx.method) {
    if (!res.headersSent && !ctx.response.has('Content-Length')) {
      const { length } = ctx.response;
      if (Number.isInteger(length)) ctx.length = length;
    }
    return res.end();
  }

  // status body
  // 响应体为 null 的情况
  if (null == body) {
    if (ctx.response._explicitNullBody) {
      ctx.response.remove('Content-Type');
      ctx.response.remove('Transfer-Encoding');
      return res.end();
    }
    if (ctx.req.httpVersionMajor >= 2) {
      body = String(code);
    } else {
      body = ctx.message || String(code);
    }
    if (!res.headersSent) {
      ctx.type = 'text';
      ctx.length = Buffer.byteLength(body);
    }
    return res.end(body);
  }

  // responses
  if (Buffer.isBuffer(body)) return res.end(body);
  if ('string' === typeof body) return res.end(body);
  if (body instanceof Stream) return body.pipe(res);

  // body: json
  // 将响应体转为 json 格式
  body = JSON.stringify(body);
  if (!res.headersSent) {
    ctx.length = Buffer.byteLength(body);
  }
  // 通过 res.end 返回响应内容
  res.end(body);
}

/**
 * Make HttpError available to consumers of the library so that consumers don't
 * have a direct dependency upon `http-errors`
 */

module.exports.HttpError = HttpError;
