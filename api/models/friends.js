module.exports = (Schema) =>
{
  return {
    attributes: {
      user_id: Schema.ObjectId,
      friend_id: Schema.ObjectId,
      createdAt: {type: Date, default: Date.now}
    }
  }
}
