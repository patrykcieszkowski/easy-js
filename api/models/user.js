module.exports = (Schema) =>
{
  return {
    attributes: {
      username: { type: String },
      password: String,
      first_name: String,
      last_name: String,
      email_address: { type: String, index: {unique: true} },
      active_chat: String,
      online: { type: Boolean, default: false, required: true },
      // 0 - male, 1 - female
      gender: { type: Number, required: true, default: 0 },
      phone: {
        code: {type: String, default: 0},
        number: {type: String}
      },
      geo: {
        name: {type: String},
        code: {type: String},
      },
      settings: {
        sounds: {type: Boolean, default: true, required: true},
        notifications: {type: Boolean, default: true, required: true},
        show_status: {type: Boolean, default: true, required: true},
        show_emoticons: {type: Boolean, default: true, required: true},
      },
      createdAt: { type: Date, default: Date.now }
    },

    methods: {

    }
  }
}
