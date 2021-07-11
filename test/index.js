const Koa = require('koa')

const app = new Koa()

const middleWare1 = async (ctx, next) => {
  ctx.msg = 'aa'
  next()
  ctx.body = ctx.msg
}

const middleWare2 = async (ctx, next) => {
  ctx.msg += 'bb'
  next()
  console.log('end: 中间件--2')
}

const middleWare3 = async (ctx, next) => {
  ctx.msg += 'cc'
}

app
  .use(middleWare1)
  .use(middleWare2)
  .use(middleWare3)

app.listen(9000, () => {
  console.log('服务已启动: 0.0.0.0:9000')
})
