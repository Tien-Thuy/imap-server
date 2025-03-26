import IMAPServer from './imap';
import * as console from "node:console";

const imapServer = new IMAPServer({
  host: '127.0.0.1',
  port: 11221,
  TLSOptions: {
    enable: false
  }
});

imapServer.on('login', (event) => {
  console.log(event)
  event.auth(true)
});

imapServer.start().catch(console.error);
