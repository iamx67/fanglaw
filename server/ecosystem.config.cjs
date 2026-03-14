module.exports = {
  apps: [
    {
      name: "fanglaw-server",
      cwd: __dirname,
      script: "dist/index.js",
      interpreter: "node",
      node_args: "--enable-source-maps",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      time: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 2567,
        PUBLIC_URL: "http://5.129.247.170:2567",
        WORLD_ROOM_NAME: "cats",
        WORLD_KEY: "main_world",
      },
    },
  ],
};
