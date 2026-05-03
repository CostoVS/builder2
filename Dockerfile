# Use a Node.js base image
FROM node:20-slim

# Install system dependencies for building static sites
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy all files
COPY . .

# Build the frontend
RUN npm run build

# Create directory for deployed sites
RUN mkdir -p deployed-sites

# Expose port 3000 (which will be mapped to 3003 externally)
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production

# Use tsx to run the server
CMD ["npm", "run", "dev"]
