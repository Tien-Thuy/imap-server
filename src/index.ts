import IMAPServer from './imap';
import * as console from "node:console";

const imapServer = new IMAPServer({
  host: '127.0.0.1',
  port: 11221,
  TLSOptions: {
    enable: false
  }
});

imapServer.on('connect', (event) => {

});

imapServer.on('close', () => {

});
imapServer.on('data', (event) => {

});
imapServer.on('error', (event) => {

});
imapServer.on('listening', (event) => {

});

imapServer.on('LOGIN', (event, tag) => {
  event.auth(true)
});

imapServer.on('LOGOUT', (event) => {
});

imapServer.on('SELECT', (event, callback, tag) => {

});

imapServer.on('CAPABILITY', (event, tag) => {

});

imapServer.on('LIST', (connection, callback, tag) => {

})

imapServer.start().catch(console.error);
