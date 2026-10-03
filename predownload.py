import ssl, urllib.request, os, re, time
ctx = ssl._create_unverified_context()
base = r'E:\Opencode\local-m2'
CHUNK = 512 * 1024

def fetch(url, dest, tries=8):
    if os.path.exists(dest) and os.path.getsize(dest) > 100000:
        # verify size via HEAD-ish
        print('HAVE', os.path.basename(dest), os.path.getsize(dest)); return True
    total = None
    for attempt in range(tries):
        try:
            start = os.path.getsize(dest) if os.path.exists(dest) else 0
            if attempt == 0 and start: os.remove(dest); start = 0
            req = urllib.request.Request(url, headers={'Range': f'bytes={start}-'})
            r = urllib.request.urlopen(req, context=ctx, timeout=90)
            if total is None:
                cr = r.headers.get('Content-Range')
                total = int(cr.split('/')[-1]) if cr and '/' in cr else None
            mode = 'ab' if start else 'wb'
            with open(dest, mode) as f:
                while True:
                    buf = r.read(CHUNK)
                    if not buf: break
                    f.write(buf)
            if total and os.path.getsize(dest) >= total:
                print('GOT', os.path.basename(dest), os.path.getsize(dest)); return True
            if not total:
                print('GOT?', os.path.basename(dest), os.path.getsize(dest)); return True
        except Exception as e:
            print('retry', attempt, os.path.basename(dest), str(e)[:80]); time.sleep(2)
    print('FAIL', url); return False

import glob
blob = ''
for path in glob.glob(r'E:\Opencode\missing.txt') + [r'E:\Opencode\build.log']:
    for enc in ('utf-16', 'utf-8', 'cp1252'):
        try:
            with open(path, encoding=enc) as f:
                blob += re.sub(r'\s+', '', f.read())
            break
        except Exception:
            continue
urls = list(dict.fromkeys(re.findall(r"https?://[^']+?\.(?:jar|aar)", blob)))
print(len(urls), 'urls')
for u in urls:
    for prefix in ('https://dl.google.com/dl/android/maven2/', 'https://repo.maven.apache.org/maven2/'):
        if u.startswith(prefix):
            rel = u[len(prefix):]; break
    else:
        print('SKIP', u); continue
    dest = os.path.join(base, rel.replace('/', os.sep))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    fetch(u, dest)
    pom = u[:-4] + '.pom'
    pdest = os.path.join(base, (rel[:-4] + '.pom').replace('/', os.sep))
    if not os.path.exists(pdest):
        try:
            r = urllib.request.urlopen(pom, context=ctx, timeout=60)
            open(pdest, 'wb').write(r.read())
            print('GOT', os.path.basename(pdest))
        except Exception as e:
            print('nopom', str(e)[:60])
print('DONE')
