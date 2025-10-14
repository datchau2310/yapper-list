<<<<<<< HEAD
FROM node:18

WORKDIR /app
COPY . .

RUN npm install

CMD ["npm", "start"]
=======
FROM node:18

WORKDIR /app
COPY . .

RUN npm install

CMD ["npm", "start"]
>>>>>>> c87eb32d8bb95909de38ccf6954bf409cf5c8f80
