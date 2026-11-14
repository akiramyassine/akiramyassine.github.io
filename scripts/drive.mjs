import { JWT } from 'google-auth-library';

const folderMime = 'application/vnd.google-apps.folder';
const supported = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
export const maxBytes = 30 * 1024 * 1024;

export function driveFromEnv(env) {
  if (!env.DRIVE_FOLDER_ID || !env.DRIVE_SERVICE_ACCOUNT_JSON) {
    throw new Error('Configurer DRIVE_FOLDER_ID et DRIVE_SERVICE_ACCOUNT_JSON.');
  }
  let credentials;
  try {
    credentials = JSON.parse(env.DRIVE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error('Le secret DRIVE_SERVICE_ACCOUNT_JSON doit contenir le JSON du compte de service.');
  }
  if (!credentials?.client_email || !credentials?.private_key) throw new Error('Identifiants du compte de service incomplets.');
  const client = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return {
    async list() {
      const { data: root } = await client.request({
        url: 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(env.DRIVE_FOLDER_ID),
        params: { fields: 'mimeType,trashed', supportsAllDrives: true },
        timeout: 30_000,
      });
      if (root.mimeType !== folderMime || root.trashed) throw new Error('Le dossier source Drive est indisponible.');
      const files = [];
      const folders = [env.DRIVE_FOLDER_ID];
      const visited = new Set();
      for (const folder of folders) {
        if (visited.has(folder)) continue;
        visited.add(folder);
        let pageToken;
        do {
          const query = new URLSearchParams({
            q: "'" + folder.replace(/['\\]/g, '\\$&') + "' in parents and trashed = false",
            fields: 'nextPageToken,incompleteSearch,files(id,mimeType,version,sha256Checksum,md5Checksum,size)',
            pageSize: '100',
            supportsAllDrives: 'true',
            includeItemsFromAllDrives: 'true',
          });
          if (pageToken) query.set('pageToken', pageToken);
          const { data } = await client.request({ url: 'https://www.googleapis.com/drive/v3/files?' + query, timeout: 30_000 });
          if (data.incompleteSearch) throw new Error('Inventaire Drive incomplet.');
          for (const file of data.files ?? []) {
            if (file.mimeType === folderMime) folders.push(file.id);
            else if (supported.has(file.mimeType) && Number(file.size) > maxBytes) console.warn('Photo Drive ignorée : plus de 30 Mio.');
            else if (supported.has(file.mimeType)) files.push(file);
            else if (file.mimeType.startsWith('image/')) console.warn('Format Drive ignoré', file.mimeType);
          }
          pageToken = data.nextPageToken;
        } while (pageToken);
      }
      return files;
    },
    async download(file) {
      if (!file.size || Number(file.size) > maxBytes) throw new Error('Photo Drive trop volumineuse ou taille absente.');
      const { data } = await client.request({
        url: 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media&supportsAllDrives=true',
        responseType: 'arraybuffer',
        timeout: 60_000,
        maxContentLength: maxBytes,
      });
      return Buffer.from(data);
    },
  };
}
