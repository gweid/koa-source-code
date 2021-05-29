const Koa = require('koa')

const app = new Koa()

const middleWare1 = (ctx, next) => {
  ctx.msg = 'aa'
  next()
  console.log('end: 中间件--1')
}

const middleWare2 = (ctx, next) => {
  ctx.msg += 'bb'
  next()
  console.log('end: 中间件--2')
}

const middleWare3 = (ctx, next) => {
  new Promise((resolve, reject) => {
    resolve()
  }).then(res => {
    ctx.msg += 'cc'
    ctx.body = ctx.msg
  })
}

app
  .use(middleWare1)
  .use(middleWare2)
  .use(middleWare3)

app.listen(9000, () => {
  console.log('服务已启动: 0.0.0.0:9000')
})
