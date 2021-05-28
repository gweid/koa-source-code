> 本文档仅为核心流程记录，一些细节功能会在源码里面进行注释



# Koa 源码阅读

当前阅读的 Koa 版本：2.13.1。基本源码目录：

```
Koa
├── benchmarks                  基准相关
├── lib                         koa 核心源码目录
│   ├── application.js          koa2 入口，封装了 context，request，response，中间件处理流程
│   ├── context.js              处理上下文，里面直接封装部分 request.js 和 response.js 的方法
│   ├── request.js              处理 http 请求
│   ├── response.js             处理 http 响应
├── test                        单元测试
├── package.json                通过 main 指定入口："main": "lib/application.js"
```

整体上，koa 源码目录是非常简单的，核心就在 lib 目录下，lib 目录下只有四个文件。



## 1、从基本使用开始

Koa 基本使用如下:

```js
const Koa = require('koa')

const app = new Koa()

const middleWare = (ctx, next) => {
  ctx.response.body = 'success'
}

app.use(middleWare)

app.listen(9000, () => {
  console.log('服务器已启动: 0.0.0.0:9000')
})
```

下面就从：

1. `require('Koa') 做了什么`
2. 为什么需要 `new Koa`
3. `app.listen` 做了什么
4. `app.use` 是怎么注册中间件的
5. `app.listen` 监听回调（用户发起请求，触发监听，激活中间件）（**重点**）

这几个方面来深入了解 Koa 内部源码



## 2、require('koa')

从上面使用的例子来看，第一步是：`const Koa = require('koa')` 将 koa 引进来，接下来就看看 koa 的入口



在 koa 源码的根目录下面找到 package.json 文件，可以发现：

> koa\package.json

```js
{
  "main": "lib/application.js",
}
```



再找到 application.js 文件

> koa\lib\application.js

```js
module.exports = class Application extends Emitter {
  // ...
}
```

可以发现，实际上，就是在 application.js 中声明了一个 Application 类，并通过 module.exports 导出。而在使用的时候，通过 `require('koa')` 引进来的就是这个 Application 类，因为是一个类，所以，引进来之后，需要通过 new 拿到 app 实例。



以上，就是 Koa 的入口



## 3、new Koa

在使用的时候执行 new Koa，主要就是通过 Application 类创建一个 app 实例的过程

> koa\lib\application.js

```js
const context = require('./context');
const request = require('./request');
const response = require('./response');

class Application extends Emitter {
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
  //...
}
```

可以看到，new Koa 得到 app 实例的时候，主要是执行了 Application 类的构造函数 constructor，里面做了一些初始化操作



## 4、app.listen

在使用的时候执行 app.listen，现在拉看看 listen 方法的定义：

```js
class Application extends Emitter {
  // ...
  
  // app.listen 就是执行的这个方法
  // 这个方法的本质就是使用 Node 的 http 模块创建一个服务并启动
  listen(...args) {
    debug('listen');
    const server = http.createServer(this.callback());
    return server.listen(...args);
  }
}
```

可以看到，listen 方法的本质就是通过 Node 的 http 模块创建一个服务并启动



到此，其实已经开启了一个服务器，接下来看看 app.use 是怎么注册中间件的



## 5、app.use

> koa\lib\application.js

```js
class Application extends Emitter {
  constructor(options) {
    // ...
    // 存放通过 app.use 注册的中间件
    this.middleware = [];
  }

  // ...
  
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
}
```

use 注册中间件的逻辑非常简单，就是：

- 判断中间件是否是函数，不是报错
- 兼容 koa1 的中间件写法，但是会警示
- 将中间件函数加进 this.middleware 数组存储



## 6、app.listen 监听回调（重点）

当用户发起请求，在 Node 中，会被 `http.createServer` 的回调函数响应，如下：

```js
const server = http.createServer((req, res) => {})
```



而 Koa 是基于 Node 的 http 模块的，如下：

```js
class Application extends Emitter {
  listen(...args) {
    const server = http.createServer(this.callback());
    return server.listen(...args);
  }
}
```

那么，在 Koa 中，http.createServer 的回调是通过执行 this.callback() 得到，this.callback() 的结果必然是返回一个函数，下面来看看 



### 6.1、Applaction.callback

> koa\lib\application.js

```js
const compose = require('koa-compose');

class Application extends Emitter {
  // ...

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
}
```

- 通过第三方库 `koa-compose` 组装中间件
- 声明函数 `handleRequest` 并返回，也就是说 `http.createServer` 接收的回调函数就是这个 `handleRequest`

当用户发起请求，Koa 接收到响应，就会执行 `handleRequest` 函数的相关逻辑，这个函数会做两件事：

- 通过 `Applaction.createContext` 创建上下文 ctx
- 返回 `Applaction.handleRequest(ctx, fn)` 执行结果，也就是说，执行 `handleRequest` 实际上执行的是 `Applaction.handleRequest(ctx, fn)`



### 6.2、compose

`applaction.callback` 中 通过 compose 组合所有的中间件，compose 是一个第三方库：

```js
├── koa-compose                     compose 源码
│   ├── index.js                compose 源码的核心             
```

其实，compose 库的源码全部都在 `compose/index.js` 中：

> koa-compose\index.js

```js
module.exports = compose

function compose (middleware) {
  // 判断传进来的参数是不是数组【参数主要就是中间件数组】
  if (!Array.isArray(middleware)) throw new TypeError('Middleware stack must be an array!')

  // 遍历中间件数组，判断里面的每一项是不是函数
  for (const fn of middleware) {
    if (typeof fn !== 'function') throw new TypeError('Middleware must be composed of functions!')
  }

  /**
   * @param {Object} context
   * @return {Promise}
   * @api public
   */

  return function (context, next) {
    // 用于存储最新一次被执行的中间件在中间件数组中的下标索引
    let index = -1
    // 第一次，参数为 0，代表第一次是执行的第一个中间件
    return dispatch(0)

    function dispatch (i) {
      if (i <= index) return Promise.reject(new Error('next() called multiple times'))

      // 存储最新一次被执行的中间件在中间件数组中的下标索引
      index = i
      // 从中间键数组中拿出对应下标的中间件
      let fn = middleware[i]
      if (i === middleware.length) fn = next
      if (!fn) return Promise.resolve()
      try {
        // 执行中间件函数，传入两个参数：
        //   1、content：上下文
        //   2、dispatch.bind(null, i + 1)：bind 还是返回 dispatch 函数，接收的参数是 i+1
        //   3、也就是说，在使用的时候通过 next() 调用，实际上就是从中间件数组中取出下一个中间件执行
        // 执行中间件的结果通过包裹一层 promise 返回，这也是为什么 Koa 中间件可以使用 async...await 的原因
        // app.use(async (ctx, next) => {})
        return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));

        // 实际上相当于：
        // Promise.resolve((function(ctx, next) {
        //   // ... 一堆逻辑

        //   // 如果调用了 next()，又马上把下一个中间件拿出来执行
        //   next()
        // })())
      } catch (err) {
        return Promise.reject(err)
      }
    }
  }
}
```

对应关系如下图：

![](/imgs/img1.png)



### 6.3、Applaction.handleRequest

上面说过，`http.createServer` 接收的回调函数就是 `handleRequest`，在用户发起请求的时候会执行 `handleRequest` 函数，而执行 `handleRequest` 函数实际上是执行 `Applaction.handleRequest`

> koa\lib\application.js

```js
class Application extends Emitter {
  // ...

  callback() {
    const fn = compose(this.middleware);

    const handleRequest = (req, res) => {
      // 通过 this.createContext 得到 ctx 上下文
      const ctx = this.createContext(req, res);
      // 执行 handleRequest 其实真正执行的是 this.handleRequest
      return this.handleRequest(ctx, fn);
    };

    return handleRequest;
  }
}
```



来看看 `Applaction.handleRequest`：

> koa\lib\application.js

```js
class Application extends Emitter {
  // ...

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
}
```

执行 `Application.handleRequest` 实际就是执行通过 compose 创建出来的 fn（fnMiddleware），执行 fn（fnMiddleware） 就是执行 compose 中的 dispatch，dispatch 函数会从中间件数组中取出中间件函数执行，结果包在 promise.resolve 中返回：

> koa-compose\index.js

```js
function compose (middleware) {
  return function (context, next) {
    // 用于存储最新一次被执行的中间件在中间件数组中的下标索引
    let index = -1
    // 第一次，参数为 0，代表第一次是执行的第一个中间件
    return dispatch(0)

    function dispatch (i) {
      if (i <= index) return Promise.reject(new Error('next() called multiple times'))

      // 存储最新一次被执行的中间件在中间件数组中的下标索引
      index = i
      // 从中间键数组中拿出对应下标的中间件
      let fn = middleware[i]
      if (i === middleware.length) fn = next
      if (!fn) return Promise.resolve()
      try {
        // 执行中间件函数，传入两个参数：
        //   1、content：上下文
        //   2、dispatch.bind(null, i + 1)：bind 还是返回 dispatch 函数，接收的参数是 i+1
        //   3、也就是说，在使用的时候通过 next() 调用，实际上就是从中间件数组中取出下一个中间件执行
        // 执行中间件的结果通过包裹一层 promise 返回，这也是为什么 Koa 中间件可以使用 async...await 的原因
        // app.use(async (ctx, next) => {})
        return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));

        // 实际上相当于：
        // Promise.resolve((function(ctx, next) {
        //   // ... 一堆逻辑

        //   // 如果调用了 next()，又马上把下一个中间件拿出来执行
        //   next()
        // })())
      } catch (err) {
        return Promise.reject(err)
      }
    }
  }
}
```



**总结：**

- `fnMiddleware(ctx)` ：实际上是执行 compose 中的 dispatch，dispatch 函数会从中间件数组中取出中间件函数执行，在执行中间件的过程中，如果调用了 next，会马上从中间件数组中取出下一个中间件执行，一次类推，最后把所有需要执行的中间件执行完，将结果包在 `Promise.resolve` 中返回

- `.then(handleResponse)`：通过 handleResponse 处理响应结果
- `.catch(onerror)`：通过 onerror 处理错误

因为是所有中间件执行完之后才处理结果，所以如下代码：

```js
const middleWare1 = (ctx, next) => {
  ctx.body = 'hello'
  next()
}

const middleWare2 = (ctx, next) => {
  ctx.body = 'hi,koa'
}

app.use(middleWare1)
app.use(middleWare2)
```

得到的响应结果是 'hi,koa'，这与 express 有所不同。



**中间件的执行机制：多个中间件会形成一个`先进后出`的栈结构，当前中间件掌握下一个中间件的执行权。例如：**

```js
const middleWare1 = (ctx, next) => {
  console.log('start：中间件--1')
  ctx.body = 'hello'
  next()
  console.log('end：中间件--1')
}

const middleWare2 = (ctx, next) => {
  console.log('start：中间件--2')
  ctx.body = 'hi,koa'
  console.log('end：中间件--2')
}

app.use(middleWare1)
app.use(middleWare2)
```

输出的顺序是：

```js
start：中间件--1
start：中间件--2
end：中间件--2
end：中间件--1
```



### 6.4、handleResponse

> koa\lib\application.js

```js
class Application extends Emitter {
  // ...
  handleRequest(ctx, fnMiddleware) {
    const handleResponse = () => respond(ctx);

    return fnMiddleware(ctx).then(handleResponse).catch(onerror);
  }
}


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
```



## 7、为什么可以通过 ctx.xxx 快捷访问

比如，在返回响应数据的时候，为什么可以通过 `ctx.body = 'xxx'` 的方式，不需要 `ctx.response.body` 这种方式也可以呢？

> koa\lib\context.js

```js
const delegate = require('delegates');

const proto = module.exports = {/.../}

// 使用 delegate 把 proto.response 里指定的方法和属性挂载到 proto 上
delegate(proto, 'response')
  .method('attachment')
  .method('redirect')
  .method('remove')
  .method('vary')
  .method('has')
  .method('set')
  .method('append')
  .method('flushHeaders')
  .access('status')
  .access('message')
  .access('body')
  .access('length')
  .access('type')
  .access('lastModified')
  .access('etag')
  .getter('headerSent')
  .getter('writable');


// 使用 delegate 把 proto.request 里指定的方法和属性挂载到 proto 上
delegate(proto, 'request')
  .method('acceptsLanguages')
  .method('acceptsEncodings')
  .method('acceptsCharsets')
  .method('accepts')
  .method('get')
  .method('is')
  .access('querystring')
  .access('idempotent')
  .access('socket')
  .access('search')
  .access('method')
  .access('query')
  .access('path')
  .access('url')
  .access('accept')
  .getter('origin')
  .getter('href')
  .getter('subdomains')
  .getter('protocol')
  .getter('host')
  .getter('hostname')
  .getter('URL')
  .getter('header')
  .getter('headers')
  .getter('secure')
  .getter('stale')
  .getter('fresh')
  .getter('ips')
  .getter('ip');
```

proto 就是 context，通过 `module.exports` 导出，`applaction.js` 中根据到此的 proto 创建 context。

可以看出，主要就是使用了第三方库 `delegate` 的能力，把 `context.response`、 `context.request` 里指定的方法和属性挂载到 context 上。

