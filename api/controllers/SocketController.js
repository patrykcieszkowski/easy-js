const NumberInt = require('mongoose-int32')
const async = require('async')
const jwt_decode = require('jwt-decode')

let clients = []

module.exports =
{
  connect: (socket) =>
  {
    let user = jwt_decode(socket.handshake.query.auth_token).user
    logic.user.fetchUser(user._id, true, (parsedUser) =>
    {
      user = parsedUser
      user._id = user._id.toString()
    })

    clients.push({_id: user._id.toString(), socketId: socket.id})

    if (!user) return socket.disconnect()
    socket.broadcast
      .to(user._id.toString())
      .emit('action', {
        type: 'PERSON_STATUS_UPDATE',
        data: {user_id: user._id.toString(), status: (user.settings.show_status)}
      })

    logic.conversation.findUserConvId(user._id, (convList) =>
    {
      for (var i = 0; i < convList.length; i++)
      {
        socket.join(convList[i])
      }
    })

    logic.user.updateStatus(user._id, true)

    socket.on('disconnect', () =>
    {
      logic.user.updateStatus(user._id, false)
      socket.broadcast
        .to(user._id.toString())
        .emit('action', {
          type: 'PERSON_STATUS_UPDATE',
          data: {user_id: user._id.toString(), status: false}
        })

      let _clientListId = clients.findIndex((_client) => _client.socketId === socket.id)
      if (_clientListId > -1)
      {
        clients.splice(_clientListId, 1)
      }
    })

    socket.on('action', (action) =>
    {
      switch(action.type)
      {
        case 'FETCH_USER':
        {
          let user_id = action.user_id || user._id
          let myselfBool = (user_id === user._id)
          logic.user.fetchUser(user_id, myselfBool, (parsedUser) =>
          {
            socket.emit('action', {
              type: 'FETCH_USER_RESULT',
              data: parsedUser,
              myself: myselfBool
            })
          })
          break
        }
        case 'FETCH_PEOPLE':
        {
          models.conversations.find({members: user._id}).lean()
            .exec((err, convList) =>
          {
            if (err) return
            let peopleList = []
            if (convList.length > 0)
            {
              peopleList = convList[0].members
              if (convList.length > 1)
              {
                peopleList = convList.map((a) => a.members).reduce((a, b) => a.concat(b))
              }

              peopleList = peopleList.map((a) => a.toString())
                .filter((el, n, arr) => n == arr.indexOf(el))
                .filter((el, n, arr) => el != user._id.toString())
            }

            async.forEachOf(peopleList, (user_id, key, cb) =>
            {
              models.user.findOne({_id: user_id}).lean()
                .exec((err, userFound) =>
              {
                if (err || !userFound) return cb()
                let myselfBool = (user_id === user._id)
                socket.join(userFound._id.toString())

                logic.user.parseUser(userFound, false, (parsedUser) =>
                {
                  socket.emit('action', {
                    type: 'FETCH_PEOPLE_RESULT',
                    data: parsedUser,
                    myself: myselfBool,
                  })

                  return cb()
                })
              })
            }, () =>
            {
              socket.emit('action', {
                type: 'FETCH_PEOPLE_COMPLETED'
              })
            })
          })
          break
        }
        case 'FETCH_CONVERSATION_LIST':
        {
          logic.conversation.findUserConvId(user._id, (convList) =>
          {
            async.forEachOf(convList, (conv_id, key, cb) =>
            {
              logic.conversation.findConversation(conv_id, true, (convFound) =>
              {
                socket.emit('action', {
                  type: 'FETCH_CONVERSATION_LIST_RESULT',
                  data: convFound
                })

                return cb()
              })
            }, () =>
            {
              socket.emit('action', {
                type: 'FETCH_CONVERSATION_LIST_COMPLETED'
              })
            })
          })
        }
        case 'FETCH_USER_CONVERSATION':
        {
          if (!action.user_id
            || user._id.toString() === action.user_id)
          {
            return
          }

          let userList = [user._id, action.user_id]
          logic.conversation.fetchConversationByMemberIds(userList, (fetchedConv) =>
          {
            if (!socket.rooms[fetchedConv._id])
            {
              socket.join(fetchedConv._id)
            }

            socket.emit('action', {type: 'FETCH_USER_CONVERSATION_RESULT', data: fetchedConv})
          })

          break
        }
        case 'FETCH_CONVERSATION':
        {
          if (!action.conv_id) return
          if (!socket.rooms[action.conv_id]) return

          logic.conversation.findConversation(action.conv_id, true, (parsedConv) =>
          {
            socket.emit('action', {type: 'FETCH_CONVERSATION_RESULT', data: parsedConv})
          }, user._id.toString())

          break
        }
        case 'SET_CONVERSATION':
        {
          if (!action.conv_id) return
          models.user.update({_id: user._id}, {active_chat: action.conv_id})
            .exec((err, userUpdated) =>
          {
            socket.emit('action', {type: 'SET_CONVERSATION_COMPLETED'})
          })
          break
        }
        case 'SEND_MESSAGE':
        {
          if (!action.conv_id || !action.content) return
          if (!socket.rooms[action.conv_id]) return

          logic.conversation.createConvEvent(
            user._id,
            action.conv_id,
            action.content,
            0,
            (parsedResult, convMembers) =>
          {
            if (!parsedResult || !convMembers) return

            for (var i = 0; i < convMembers.length; i++)
            {
              let _user = clients.find((_client) => _client._id === convMembers[i])
              if (_user)
              {
                let _socket = global.io.sockets.connected[_user.socketId]
                if (!_socket.rooms[action.conv_id])
                {
                  _socket.join(action.conv_id)
                }
              }
            }

            /*
              emit to everyone in the room
            */
            global.io.sockets
              .in(action.conv_id)
              .emit('action', {
                type: 'SEND_MESSAGE_COMPLETED',
                data: parsedResult,
                members: convMembers
              })

            /*
              emit to everyone, but sender
            */
            // socket.broadcast
            //   .to(action.conv_id)
            //   .emit('action', {
            //     type: 'SEND_MESSAGE_COMPLETED',
            //     data: parsedResult
            //   })
          })
          break
        }
        case 'UPDATE_SETTINGS_USER_NAME':
        {
          logic.user.updateSettingsName(user._id, action.first_name, action.last_name, (data) =>
          {
            if (!data) return
            socket.emit('action', {
              type: 'UPDATE_SETTINGS_USER_NAME_COMPLETED',
              last_name: action.last_name,
              first_name: action.first_name
            })
          })
          break
        }
        case 'UPDATE_SETTINGS_PHONE_NUMBER':
        {
          logic.user.updateSettingsPhoneNumber(user._id, action.code, action.number, (phoneObj) =>
          {
            if (!data) return
            user.phone = {code: action.code, number: action.number}
            save(() => {})
            socket.emit('action', {
              type: 'UPDATE_SETTINGS_PHONE_NUMBER_COMPLETED',
              data: data
            })
          })
          break
        }
        case 'UPDATE_SETTINGS_BOOLS':
        {
          logic.user.updateSettingsBools(user._id, action.key, action.value, (data) =>
          {
            if (!data) return
            user.settings[action.key] = action.value
            socket.emit('action', {
              type: 'UPDATE_SETTINGS_BOOLS_COMPLETED',
              key: action.key
            })
          })
          break
        }
        case 'FETCH_SEARCH':
        {
          logic.user.fetchSearch(
              action.location,
              action.name,
              action.online,
              action.gender,
              action.page,
            (peopleFound) =>
          {
            if (!peopleFound || peopleFound.length < 1) return

            async.forEachOf(peopleFound, (userFound, key, cb) =>
            {
              let myselfBool = (userFound._id === user._id)
              logic.user.parseUser(userFound.document, false, (parsedUser) =>
              {
                socket.emit('action', {
                  type: 'FETCH_SEARCH_RESULT',
                  searchType: action.searchType,
                  data: parsedUser,
                  myself: myselfBool,
                })
              })
            }, () =>
            {
              socket.emit('action', {type: 'FETCH_SEARCH_COMPLETE', searchType: action.searchType,})
            })
          })

          break
        }
        case 'READ_CONVERSATION_MESSAGES':
        {
          models.conversation_events.update(
            { $atomic: 1,
              conv_id: action.conv_id,
              seen: { $not: { $elemMatch: {user_id: user._id } } }
            },
            { $push: {
              seen: {
                $each: [{ user_id: user._id, date: Date.now() }]
              }
            },
          })
            .exec((err, eventsFound) =>
          {
            socket.broadcast
              .to(action.conv_id)
              .emit('action', {
                type: 'READ_CONVERSATION_MESSAGES_NEW',
                conv_id: action.conv_id,
                user_id: user._id.toString()
              })
          })
        }
      }
    })
  }
}
