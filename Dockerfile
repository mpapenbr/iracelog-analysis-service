FROM node:14
COPY dist /dist
CMD ["node", "dist/index.js"]