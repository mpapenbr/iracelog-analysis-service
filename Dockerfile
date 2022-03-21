FROM node:16-alpine
COPY dist /dist
COPY node_modules /node_modules
CMD ["node", "dist/index.js"]