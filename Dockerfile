FROM nodejs

COPY . /home

WORKDIR /home

RUN npm install

CMD ["node", "server.js"]