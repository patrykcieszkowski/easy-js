'use strict'
const mongoose = require('mongoose')
const Schema = mongoose.Schema
const fs = require('fs')
const async = require('async')

let path = __dirname + '/'
async.forEachOf(fs.readdirSync(path), (file, key, cb) =>
{
  if (file.match(/\.js$/) !== null && file !== 'index.js')
  {
    let name = file.replace('.js', '')
    let model = require(path + file)(Schema)
    let modelSchema = new Schema(model.attributes, {collection: name, id: false})
    modelSchema.set('toJSON')
    exports[name] = mongoose.model(name, modelSchema)
  }
  return cb()
})
