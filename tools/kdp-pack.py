# Encrypts a KDP-ready zip for the admin "Amazon KDP" tab, with the admin's PUBLIC key only (no secret is handled here).
# usage: python3 tools/kdp-pack.py <public_jwk.json> <slug> <book_id> "<title>" "<author>" <pages> <spine_in> <zip>
# file = [2 bytes: wrapped key length][RSA-OAEP(SHA-256) wrapped AES-256 key][12-byte iv][AES-GCM ciphertext+tag]
# Only the signed-in admin can read the private key (database policy), so only the admin's browser can open these files.
import os, sys, json, base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes
jwk_path, slug, bid, title, author, pages, spine, z = sys.argv[1:9]
jwk = json.load(open(jwk_path))
b = lambda s: int.from_bytes(base64.urlsafe_b64decode(s + '=' * (-len(s) % 4)), 'big')
pub = rsa.RSAPublicNumbers(b(jwk['e']), b(jwk['n'])).public_key()
data = open(z, 'rb').read()
aes = AESGCM.generate_key(256); iv = os.urandom(12)
wrapped = pub.encrypt(aes, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
open(f'kdp/{slug}.enc', 'wb').write(len(wrapped).to_bytes(2, 'big') + wrapped + iv + AESGCM(aes).encrypt(iv, data, None))
idx = json.load(open('kdp/index.json')) if os.path.exists('kdp/index.json') else []
idx = [x for x in idx if x['slug'] != slug] + [{'slug': slug, 'book_id': bid, 'title': title, 'author': author, 'pages': int(pages), 'spine_in': float(spine), 'zip_name': os.path.basename(z), 'size': len(data)}]
json.dump(sorted(idx, key=lambda x: x['title']), open('kdp/index.json', 'w'), indent=1, ensure_ascii=False)
print('packed', slug, len(data))
