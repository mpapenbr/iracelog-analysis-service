FROM node:16
COPY dist /dist
COPY node_modules /node_modules
CMD ["node", "dist/index.js"]