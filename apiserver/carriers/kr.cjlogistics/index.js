const axios = require('axios')
const cheerio = require('cheerio')
const Cookie = require('tough-cookie').Cookie;
const qs = require('querystring')

const STATUS_MAP = {
  null: {id: 'information_received', text:'상품준비중'},
  11: {id: 'at_pickup', text:'상품인수'},
  41: {id: 'in_transit', text:'상품이동중'},
  42: {id: 'in_transit', text:'상품이동중'}, // 원래는 배송지 도착이지만 제공하지 않음 (표준화)
  44: {id: 'in_transit', text:'상품이동중'},
  82: {id: 'out_for_delivery', text:'배송출발'},
  91: {id: 'delivered', text:'배달완료'},
}

function parseTime(s) {
  return s.replace(' ', 'T').substring(0, s.lastIndexOf('.')) + '+09:00'
}

function getTrack(trackId) {
  return new Promise((resolve, reject) => {
    if(!/^(\d{10}(\d{2})?)?$/.test(trackId)) {
      return reject({
        code: 400,
        message: '운송장 번호는 10자리 혹은 12자리입니다.'
      })
    }

    axios.get('https://www.cjlogistics.com/ko/tool/parcel/tracking').then(res => {
      const cookie = res.headers['set-cookie'].map(Cookie.parse).map(c => c.cookieString()).join('; ')

      // const dom = new JSDOM(res.data)
      // const document = dom.window.document
      const $ = cheerio.load(res.data)

      return axios.post('https://www.cjlogistics.com/ko/tool/parcel/tracking-detail', qs.stringify({
        paramInvcNo: trackId,
        // _csrf: document.querySelector('input[name="_csrf"]').value,
        _csrf: $('input[name=_csrf]').val(),
      }), {
        headers: {
          Cookie: cookie,
        },
      })
    }).then(res => {
      const informationTable = res.data.parcelResultMap.resultList
      const progressTable = res.data.parcelDetailResultMap.resultList

      if(progressTable.length == 0) {
        return reject({
          code: 404,
          message: '해당 운송장이 존재하지 않습니다.'
        })
      }

      return { informationTable, progressTable }
    }).then(({ informationTable, progressTable }) => {
      let shippingInformation = {
        from: {name: null, time: null},
        to: {name: null, time: null},
        state: null,
        progresses: (rows => {
          return rows.map(row => {
            return {
              time: parseTime(row.dTime),
              status: STATUS_MAP[row.crgSt],
              location: {
                name: row.regBranNm,
              },
              description: row.crgNm,
            }
          })
        })(progressTable)
      }

      // 정보 순서가 꼬인 경우가 있어서 무조건 마지막이 배송완료가 아님
      // 1. 배송완료가 어딘가에 있으면 배송완료
      console.log('shippingInformation', shippingInformation)

      shippingInformation.progresses.forEach((e, i) => {
        console.log(e)
        if (e.status.id === 'delivered') {
          shippingInformation.state = e.status
        }
      })

      shippingInformation.state = shippingInformation.state || {}

      // 2. 배송완료가 아니면 마지막 것이 배송 완료
      if (shippingInformation.state.id !== 'delivered') {
        shippingInformation.state = shippingInformation.progresses[shippingInformation.progresses.length - 1].status
      }

      if(informationTable.length != 0) {
        shippingInformation.from = {
          name: informationTable[0].sendrNm.substring(0, 1) + '*',
          time: parseTime(progressTable[0].dTime),
        }

        shippingInformation.to = {
          name: informationTable[0].rcvrNm.substring(0, 1) + '*',
          time: shippingInformation.state.id == 'delivered' ?
                  shippingInformation.progresses[shippingInformation.progresses.length - 1].time : null
        }
      }

      resolve(shippingInformation)
    }).catch(err => reject(err))
  })
}

module.exports = {
    info: {
        name: 'CJ대한통운',
        tel: '+8215881255'
    },
    getTrack: getTrack,
}
