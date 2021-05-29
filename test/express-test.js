const express = require('express')

const app = express()

const middleWare1 = (req, res, next) => {
  req.msg = 'aa'
  next()
}

const middleWare2 = (req, res, next) => {
  req.msg += 'bb'
  next()
}

const middleWare3 = (req, res, next) => {
  new Promise((resolve, reject) => {
    resolve()
  }).then(resData => {
    req.msg += 'cc'
    res.end(req.msg)
  })
}

app.use(middleWare1, middleWare2, middleWare3)

app.listen(9000, () => {
  console.log('服务已启动: 0.0.0.0:9000')
})