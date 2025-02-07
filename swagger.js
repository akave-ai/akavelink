const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Akave Link API",
      version: "1.0.0",
      description:
        "API for interacting with Akave's decentralized storage network",
    },
    servers: [
      {
        url: "http://localhost:3000",
      },
    ],
  },
  apis: ["./server.js"], // Point to your server file
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
