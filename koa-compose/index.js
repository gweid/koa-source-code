'use strict'

/**
 * Expose compositor.
 */

module.exports = compose

/**
 * Compose `middleware` returning
 * a fully valid middleware comprised
 * of all those which are passed.
 *
 * @param {Array} middleware
 * @return {Function}
 * @api public
 */

function compose (middleware) {
  // 判断传进来的参数是不是数组【参数主要就是中间件数组】
  if (!Array.isArray(middleware)) throw new TypeError('Middleware stack must be an array!')

  // 遍历中间件数组，判断里面的每一项是不是函数
  for (const fn of middleware) {
    if (typeof fn !== 'function') throw new TypeError('Middleware must be composed of functions!')
  }

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
        // 上面类比：app.use(async (ctx, next) => {})
        // 执行中间件的结果通过包裹一层 promise 返回，这也是为什么 Koa 中间件可以使用 async...await 的原因
        // 而 Promise.resolve 的结果需要在 then 中才能拿到
        return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));

        // 实际上相当于：
        // Promise.resolve((function(ctx, next) {
        //   // ... 一堆逻辑

        //   // 如果调用了 next()，又马上把下一个中间件拿出来执行，而结果需要在 then 中才能拿到
        //   next()
        // })())
      } catch (err) {
        return Promise.reject(err)
      }
    }
  }
}
