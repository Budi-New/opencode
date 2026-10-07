import ssl, urllib.request, os, time
ctx = ssl.create_default_context()
URL = 'https://repo.maven.apache.org/maven2/org/jetbrains/kotlin/kotlin-compiler-embeddable/1.9.22/kotlin-compiler-embeddable-1.9.22.jar'
DEST = r'D:\Opencode\local-m2\org\jetbrains\kotlin\kotlin-compiler-embeddable\1.9.22\kotlin-compiler-embeddable-1.9.22.jar'
CHUNK = 64 * 1024
os.makedirs(os.path.dirname(DEST), exist_ok=True)
# get total
for _ in range(10):
    try:
        q = urllib.request.Request(URL, headers={'Range': 'bytes=0-0'})
        r = urllib.request.urlopen(q, context=ctx, timeout=60)
        cr = r.headers.get('Content-Range')
        total = int(cr.split('/')[-1])
        print('total', total); break
    except Exception as e:
        print('sizere try', str(e)[:70]); time.sleep(3)
else:
    raise SystemExit('no size')
start = os.path.getsize(DEST) if os.path.exists(DEST) else 0
print('resume from', start)
with open(DEST, 'ab' if start else 'wb') as f:
    pos = start
    while pos < total:
        end = min(pos + CHUNK - 1, total - 1)
        ok = False
        for a in range(30):
            try:
                q = urllib.request.Request(URL, headers={'Range': f'bytes={pos}-{end}'})
                r = urllib.request.urlopen(q, context=ctx, timeout=90)
                data = r.read()
                if len(data) == 0: raise IOError('empty')
                f.write(data); f.flush()
                pos += len(data); ok = True
                if pos % (20 * CHUNK) < len(data): print(f'{pos}/{total}')
                break
            except Exception as e:
                time.sleep(1 + a * 0.3)
        if not ok:
            print('CHUNK FAIL at', pos); break
print('END', os.path.getsize(DEST), '/', total)
