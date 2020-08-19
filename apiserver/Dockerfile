FROM node:carbon

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

RUN apt-get update
RUN apt-get install -y nmap

#COPY package*.json ./
RUN npm install
RUN npm install -g nodemon

#COPY . .

EXPOSE 8080

#CMD [ "npm", "start" ]
CMD npm install \
    && npm start
