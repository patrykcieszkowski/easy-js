module.exports = (Schema) =>
{
  return {
    attributes: {
      user_id: Schema.ObjectId,
      conv_id: Schema.ObjectId,
      /*
        0 - msg
      */
      type: Number,
      content: String,
      seen: [{user_id: Schema.ObjectId, date: Date}],
      createdAt: {type: Date, default: Date.now}
    }
  }
}
