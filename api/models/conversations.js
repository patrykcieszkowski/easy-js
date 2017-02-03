module.exports = (Schema) =>
{
  return {
    attributes: {
      members: [Schema.ObjectId],
      createdAt: {type: Date, default: Date.now}
    }
  }
}
