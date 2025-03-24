import {EventEmitter} from 'events';
import net from "net";
import * as tls from "node:tls";
import randomString from "randomstring";

export interface IMAPServerConfig {
  host: string;
  port: number;
  welcomeMessage: string;
  state: 'not_authenticated' | 'authenticated' | 'selected' | 'logout';
  TLSOptions: {
    enable: boolean;
    key?: string;
    cert?: string;
    ca?: string;
  },
  idleTimeout?: number;
  maxConnections?: number;
}

export interface IMAPConnection {
  id: string;
  socket: net.Socket | tls.TLSSocket;
  state: 'not_authenticated' | 'authenticated' | 'selected' | 'logout';
  user?: string;
  selectedMailbox?: string;
  secure: boolean;
}

export default class IMAPServer extends EventEmitter {
  private readonly config: IMAPServerConfig;
  private connections: Map<string, IMAPConnection>;
  private running: boolean;
  private server?: net.Server | tls.Server;

  constructor(config: IMAPServerConfig) {
    super();
    this.config = {
      ...{
        welcomeMessage: 'Welcome to Tien Thuy IMAP Server',
        TLSOptions: {
          enable: false
        },
        idleTimeout: 180000,
        maxConnections: 0,
      },
      ...config
    };
    this.connections = new Map();
    this.running = false;
  }

  public async start() {
    if (this.running) {
      throw new Error('IMAP server is started.');
    }
    if (this.config.TLSOptions.enable) {
      this.server = net.createServer({
        allowHalfOpen: false,
        pauseOnConnect: false
      });
    } else {
      if (!this.config.TLSOptions.key || !this.config.TLSOptions.cert) {
        throw new Error('TLS key and cert are required.');
      }

      this.server = tls.createServer(this.config.TLSOptions);
    }

    this.server.on('connection', this.handleConnection.bind(this));
    this.server.on('error', this.handleError.bind(this));

    await new Promise<void>((resolve) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        this.running = true;
        this.emit('listening', {
          address: this.config.host,
          port: this.config.port,
          secure: this.config.TLSOptions.enable
        });
        resolve();
      });
    });

    console.log(`IMAP is started at ${this.config.host}:${this.config.port} (${this.config.TLSOptions.enable ? 'secure' : 'standard'})`);
  }

  public async stop() {
    if (!this.running || !this.server) {
      throw new Error('IMAP server is not started.');
    }

    for (const connection of this.connections.values()) {
      this.closeConnection(connection);
    }

    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.running = false;
          this.emit('closed');
          resolve();
        }
      });
    });
  }

  public closeConnection(connection: IMAPConnection, reason: string = 'Server shutdown') {
    try {
      if (!connection.socket.destroyed) {
        connection.socket.end();
      }
    } catch (error) {
      console.error(`Error closing connection ${connection.id}:`, error);
    } finally {
      this.connections.delete(connection.id);
    }
  }

  private handleConnection(socket: net.Socket | tls.TLSSocket): void {
    if (this.config.maxConnections !== 0 && this.connections.size >= this.config.maxConnections) {
      socket.end('* NO Too many connections\r\n');
      socket.destroy();
      return;
    }

    const connectionId: string = randomString.generate(22);
    const connection: IMAPConnection = {
      id: connectionId,
      socket,
      state: 'not_authenticated',
      secure: this.config.TLSOptions.enable || socket instanceof tls.TLSSocket
    };
    this.connections.set(connectionId, connection);
    socket.on('close', () => this.handleOnClose(connection));
    socket.on('timeout', () => this.handleOnTimeout(connection));
    socket.on('error', (error) => this.handleOnError(connection, error));
    socket.on('data', (data) => this.handleOnData(connection, data))
    if (this.config.idleTimeout !== 0) {
      socket.setTimeout(this.config.idleTimeout);
    }

    this.sendResponse(connection, this.config.welcomeMessage);
    this.emit('connection', {
      id: connectionId,
      remoteAddress: socket.remoteAddress,
      secure: connection.secure
    });
  }

  private handleError(error: Error): void {
    console.error('Server error:', error);
    this.emit('error', error);
  }

  private handleOnClose(connection: IMAPConnection) {

  }

  private handleOnTimeout(connection: IMAPConnection) {

  }

  private handleOnError(connection: IMAPConnection, error: any) {

  }

  private handleOnData(connection: IMAPConnection, data: Buffer): void {
    const commands: string[] = data.toString('utf8').trim().split(' ');
    if (commands.length < 2) {
      this.sendResponse(connection, '* BAD Malformed command');
      return;
    }
    const tag: string = commands[0];
    const command: string = commands[1].toUpperCase();
    const args: string[] = commands.slice(2);

    switch (command) {
      case 'CAPABILITY':
        this.handleCapability(connection, tag);
        break;
      case 'LOGIN':
        this.handleLogin(connection, tag, args);
        break;
      case 'LOGOUT':
        this.handleLogout(connection, tag);
        break;
      case 'SELECT':
        this.handleSelect(connection, tag, args);
        break;
      case 'LIST':
        this.handleList(connection, tag, args);
        break;
      case 'NOOP':
        this.sendResponse(connection, `${tag} OK NOOP completed`);
        break;
      case 'STARTTLS':
        this.handleStartTLS(connection, tag);
        break;
      default:
        this.sendResponse(connection, `${tag} BAD Command not recognized or not implemented`);
        break;
    }
  }

  private sendResponse(connection: IMAPConnection, response: string): void {
    try {
      if (connection.socket.writable) {
        connection.socket.write(response + '\r\n');
        // Log phản hồi (cần lọc thông tin nhạy cảm trước khi log)
        console.log(`[${connection.id}] S: ${response}`);
      }
    } catch (error) {
      console.error(`Error sending response to ${connection.id}:`, error);
      this.closeConnection(connection, 'Failed to send response');
    }
  }

  private handleCapability(connection: IMAPConnection, tag: string): void {
    const capabilities = [
      'IMAP4rev1',
      'AUTH=PLAIN',
      'AUTH=LOGIN'
    ];
    if (!connection.secure) {    // Thêm STARTTLS nếu server không bảo mật
      capabilities.push('STARTTLS');
    }

    this.sendResponse(connection, `* CAPABILITY ${capabilities.join(' ')}`);
    this.sendResponse(connection, `${tag} OK CAPABILITY completed`);
  }

  /**
   * Xử lý lệnh LOGIN
   */
  private handleLogin(connection: IMAPConnection, tag: string, args: string[]): void {
    if (connection.state !== 'not_authenticated') {    // Kiểm tra trạng thái kết nối
      this.sendResponse(connection, `${tag} BAD Command not valid in current state`);
      return;
    }
    if (args.length < 2) { // Kiểm tra tham số
      this.sendResponse(connection, `${tag} BAD Missing required arguments`);
      return;
    }

    const username = args[0].replace(/"/g, '');
    const password = args[1].replace(/"/g, '');

    // Ở đây bạn sẽ thêm xác thực người dùng thực tế
    // TODO: Callback to auth
    const authSuccess = true;

    if (authSuccess) {
      connection.state = 'authenticated';
      connection.user = username;
      this.sendResponse(connection, `${tag} OK LOGIN completed`);

      // Phát ra sự kiện đăng nhập thành công
      this.emit('login', {
        id: connection.id,
        user: username
      });
    } else {
      this.sendResponse(connection, `${tag} NO LOGIN failed`);
    }
  }

  private handleLogout(connection: IMAPConnection, tag: string): void {
    this.sendResponse(connection, '* BYE IMAP server logging out');
    this.sendResponse(connection, `${tag} OK LOGOUT completed`);
// TODO: Callback to auth
    connection.state = 'logout';
    this.closeConnection(connection, 'Client logout');
  }

  private handleSelect(connection: IMAPConnection, tag: string, args: string[]): void {
    // Kiểm tra trạng thái kết nối
    if (connection.state !== 'authenticated' && connection.state !== 'selected') {
      this.sendResponse(connection, `${tag} BAD Command not valid in current state`);
      return;
    }

    // Kiểm tra tham số
    if (args.length < 1) {
      this.sendResponse(connection, `${tag} BAD Missing required arguments`);
      return;
    }

    const mailboxName = args[0].replace(/"/g, '');

    // Ở đây bạn sẽ thêm logic để chọn hộp thư
    // Ví dụ này giả định thành công
    connection.state = 'selected';
    connection.selectedMailbox = mailboxName;

    // Gửi trạng thái hộp thư
    this.sendResponse(connection, `* 0 EXISTS`);
    this.sendResponse(connection, `* 0 RECENT`);
    this.sendResponse(connection, `* OK [UNSEEN 0] No unseen messages`);
    this.sendResponse(connection, `* OK [UIDVALIDITY 1] UIDs valid`);
    this.sendResponse(connection, `* OK [UIDNEXT 1] Predicted next UID`);
    this.sendResponse(connection, `* FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)`);
    this.sendResponse(connection, `* OK [PERMANENTFLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)] Permanent flags`);
    this.sendResponse(connection, `${tag} OK [READ-WRITE] SELECT completed`);
  }

  /**
   * Xử lý lệnh LIST
   */
  private handleList(connection: IMAPConnection, tag: string, args: string[]): void {
    // Kiểm tra trạng thái kết nối
    if (connection.state !== 'authenticated' && connection.state !== 'selected') {
      this.sendResponse(connection, `${tag} BAD Command not valid in current state`);
      return;
    }
    // Kiểm tra tham số
    if (args.length < 2) {
      this.sendResponse(connection, `${tag} BAD Missing required arguments`);
      return;
    }

    // TODO: callback to show list mailbox
    this.sendResponse(connection, '* LIST (\\HasNoChildren) "." "INBOX"');
    this.sendResponse(connection, '* LIST (\\HasNoChildren) "." "Sent"');
    this.sendResponse(connection, '* LIST (\\HasNoChildren) "." "Drafts"');
    this.sendResponse(connection, '* LIST (\\HasNoChildren) "." "Trash"');
    this.sendResponse(connection, '* LIST (\\HasNoChildren) "." "Junk"');
    this.sendResponse(connection, `${tag} OK LIST completed`);
  }

  /**
   * Xử lý lệnh STARTTLS
   */
  private handleStartTLS(connection: IMAPConnection, tag: string): void {
    // Kiểm tra nếu đã là kết nối bảo mật
    if (connection.secure) {
      this.sendResponse(connection, `${tag} BAD Connection already secure`);
      return;
    }

    // Kiểm tra nếu không có cấu hình TLS
    if (!this.config.TLSOptions.enable || !this.config.TLSOptions.key || !this.config.TLSOptions.cert) {
      this.sendResponse(connection, `${tag} NO STARTTLS not available`);
      return;
    }

    this.sendResponse(connection, `${tag} OK Begin TLS negotiation now`);

    // Nâng cấp kết nối lên TLS
    const socket = connection.socket as net.Socket;
    const secureContext = tls.createSecureContext(this.config.TLSOptions);

    // Lưu socket ID và state trước khi nâng cấp
    const connectionId = connection.id;
    const state = connection.state;
    const user = connection.user;

    try {
      // Upgrade socket to TLS
      const secureSocket = new tls.TLSSocket(socket, {
        secureContext,
        isServer: true,
        rejectUnauthorized: false
      });
      this.connections.delete(connectionId);
      const secureConnection: IMAPConnection = {
        id: connectionId,
        socket: secureSocket,
        state,
        user,
        secure: true
      };
      this.connections.set(connectionId, secureConnection);
      secureSocket.on('close', () => this.handleOnClose(connection));
      secureSocket.on('timeout', () => this.handleOnTimeout(connection));
      secureSocket.on('error', (error) => this.handleOnError(connection, error));
      secureSocket.on('data', (data) => this.handleOnData(connection, data))
    } catch (error) {
      console.error('Lỗi nâng cấp kết nối TLS:', error);
      this.closeConnection(connection, 'TLS upgrade failed');
    }
  }
}
