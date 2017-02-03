'use strict'

module.exports = {
  verifyEmail: (email) =>
  {
    let re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    return re.test(email)
  },

  verifyPassword: (password) =>
  {
    let re = /^[a-zA-Z0-9]{8,}$/
    return re.test(password)
  },

  formatPhoneNumber: (phoneObj) =>
  {
    let spaces = [3, 6]
    let output = '0'
    let code = ''

    if (phoneObj.code)
    {
      code = '+'+phoneObj.code+' '
      output = ''
    }

    for (var i = 0; i < phoneObj.number.length; i++)
    {
      if (spaces.includes(i)) output += ' '
      output += phoneObj.number[i]
    }

    return (code+output)
  }
}
