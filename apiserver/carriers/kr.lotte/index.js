const _ = require("lodash");
const axios = require("axios");
const { JSDOM } = require("jsdom");
const Cookie = require("tough-cookie").Cookie;
const qs = require("querystring");

const trimString = s => {
  return s.replace(/([\n\t]{1,}|\s{2,})/g, " ").trim();
};

const parseStatus = s => {
  console.log("parseStatus", s);
  if (s.includes("보내")) return { id: "at_pickup", text: "상품인수" };
  if (s.includes("배달 예정"))
    return { id: "out_for_delivery", text: "배송출발" };
  if (s.includes("배달 완료") || s.includes("물품을 받으셨습니다"))
    return { id: "delivered", text: "배송완료" };
  return { id: "in_transit", text: "이동중" };
};

function getTrack(trackId) {
  return new Promise((resolve, reject) => {
    axios
      .get(`https://www.lotteglogis.com/open/tracking?invno=${trackId}`)
      .then(res => {
        const cookie = res.headers["set-cookie"]
          .map(Cookie.parse)
          .map(c => c.cookieString())
          .join("; ");
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            resolve({ cookie });
          }, 2400);
        });
      })
      .then(({ cookie }) => {
        return axios.post(
          "https://www.lotteglogis.com/open/tracking",
          qs.stringify({
            action: "processSubmit"
          }),
          {
            headers: {
              Cookie: cookie
            }
          }
        );
      })
      .then(res => {
        const dom = new JSDOM(res.data);
        const document = dom.window.document;

        return {
          informationTable: document.querySelector("table"),
          progressTable: document.querySelector("table table")
        };
      })
      .then(({ informationTable, progressTable }) => {
        if (
          informationTable
            .querySelector("tr:last-child td")
            .getAttribute("colspan") === "4"
        ) {
          return reject({
            code: 404,
            message: informationTable.querySelector("tr:last-child td")
              .innerHTML
          });
        }

        let shippingInformation = {
          from: { time: null },
          to: { time: null },
          state: {},
          progresses: (table => {
            let result = [];
            table.querySelectorAll("tr").forEach(element => {
              const tds = element.querySelectorAll("td");
              if (element.hasAttribute("bgcolor")) {
                return;
              } // 색깔 줄 ...
              if (tds.length <= 1) {
                return;
              } // 색깔 줄 ...
              // if ( tds[1] && tds[1].innerHTML == '--:--' ) { return } // 왜 리턴했을까??
              result.push({
                time: `${tds[0].innerHTML.replace(/\./g, "-")}T${
                  tds[1].innerHTML
                }:00+09:00`,
                location: {
                  name: trimString(tds[2].textContent)
                },
                status: parseStatus(tds[3].textContent),
                description: trimString(tds[3].textContent)
              });
            });
            return result;
          })(progressTable)
        };

        if (shippingInformation.progresses.length < 1) {
          shippingInformation.state = {
            id: "information_received",
            text: "방문예정"
          };
        } else {
          const { progresses } = shippingInformation;
          const dProgress = _.find(
            progresses,
            p => (p.status || {}).id === "delivered"
          );
          const pickProgress = _.find(
            progresses,
            p => (p.status || {}).id === "at_pickup"
          );

          // set last status
          shippingInformation.state =
            dProgress.status ||
            shippingInformation.progresses[
              shippingInformation.progresses.length - 1
            ].status;

          // from time
          shippingInformation.from.time = (pickProgress || {}).time;
          // to time
          shippingInformation.to.time = (dProgress || {}).time;
        }

        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: "롯데택배",
    tel: "+8215882121"
  },
  getTrack: getTrack
};

// getTrack('401041508125').then(res => console.log(JSON.stringify(res, 0, 2))).catch(err => console.log(err))
