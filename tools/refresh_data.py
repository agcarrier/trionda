#!/usr/bin/env python3
"""
TRIONDA — daily tournament data refresh.
Fetches the 2026 FIFA World Cup pages from Wikipedia, parses standings,
group fixtures and the knockout tree, and rewrites ../bracket-data.js.

Run:  python3 tools/refresh_data.py          (from repo root or tools/)
Exit: 0 = success (file written), 1 = fetch/parse failure (file untouched)
"""
import re, json, html as H, sys, urllib.request, pathlib, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "bracket-data.js"
UA = {"User-Agent": "Mozilla/5.0 (TriondaShowcase/1.0; personal concept site)"}

CODES = {
 'Algeria':'ALG','Argentina':'ARG','Australia':'AUS','Austria':'AUT','Belgium':'BEL',
 'Bosnia and Herzegovina':'BIH','Brazil':'BRA','Canada':'CAN','Cape Verde':'CPV','Colombia':'COL',
 'Croatia':'CRO','Curaçao':'CUW','Czech Republic':'CZE','DR Congo':'COD','Ecuador':'ECU','Egypt':'EGY',
 'England':'ENG','France':'FRA','Germany':'GER','Ghana':'GHA','Haiti':'HAI','Iran':'IRN','Iraq':'IRQ',
 'Ivory Coast':'CIV','Japan':'JPN','Jordan':'JOR','Mexico':'MEX','Morocco':'MAR','Netherlands':'NED',
 'New Zealand':'NZL','Norway':'NOR','Panama':'PAN','Paraguay':'PAR','Portugal':'POR','Qatar':'QAT',
 'Saudi Arabia':'KSA','Scotland':'SCO','Senegal':'SEN','South Africa':'RSA','South Korea':'KOR',
 'Spain':'ESP','Sweden':'SWE','Switzerland':'SUI','Tunisia':'TUN','Turkey':'TUR','United States':'USA',
 'Uruguay':'URU','Uzbekistan':'UZB'}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def text_of(f):
    t = re.sub(r'<[^>]+>', '', f)
    return H.unescape(t).replace(' ', ' ').strip()


def parse_footballboxes(page):
    boxes = []
    for m in re.finditer(r'<div[^>]*class="footballbox"[^>]*>', page):
        start = m.start()
        end = page.find('class="footballbox"', m.end())
        seg = page[start:end if end != -1 else start + 12000][:12000]
        dm = re.search(r'class="bday[^"]*">\s*([0-9-]+)', seg)
        date = dm.group(1) if dm else None

        def team_of(cls):
            tm = re.search(r'class="%s"[^>]*>(.*?)</th>' % cls, seg, re.S)
            if not tm: return None
            for lm in re.finditer(r'<a[^>]*>(.*?)</a>', tm.group(1), re.S):
                t = text_of(lm.group(1))
                if t: return t
            return text_of(tm.group(1)) or None

        home, away = team_of('fhome'), team_of('faway')
        sm = re.search(r'class="fscore"[^>]*>(.*?)</th>', seg, re.S)
        raw = text_of(sm.group(1)) if sm else ''
        aet = 'a.e.t.' in raw
        sc = re.search(r'(\d+)\s*[–-]\s*(\d+)', raw)
        hs, aws = (int(sc.group(1)), int(sc.group(2))) if sc else (None, None)
        pens = None
        pm = re.search(r'Penalties.*?(\d+)\s*[–-]\s*(\d+)', seg, re.S)
        if pm: pens = [int(pm.group(1)), int(pm.group(2))]
        venue = city = None
        fr = re.search(r'class="fright"[^>]*>(.*?)(?:Attendance|Referee|</div>\s*</div>)', seg, re.S)
        if fr:
            links = [text_of(x) for x in re.findall(r'<a[^>]*>(.*?)</a>', fr.group(1))]
            links = [x for x in links if x]
            if links: venue = links[0]
            if len(links) > 1: city = links[1]
        boxes.append(dict(pos=start, date=date, home=home, away=away, hs=hs, aws=aws,
                          aet=aet, pens=pens, venue=venue, city=city))
    return boxes


def parse_standings(page):
    ti = page.find('>Pld<')
    if ti == -1: return []
    seg = page[page.rfind('<table', 0, ti):page.find('</table>', ti)]
    rows = []
    for rm in re.finditer(r'<tr[^>]*>(.*?)</tr>', seg, re.S):
        row = rm.group(1)
        if '>Pld<' in row: continue
        th = re.search(r'<th[^>]*scope="row"[^>]*>(.*?)</th>', row, re.S)
        if not th: continue
        team = None
        for lm in re.finditer(r'<a[^>]*>(.*?)</a>', th.group(1), re.S):
            t = text_of(lm.group(1))
            if t: team = t; break
        if not team: continue
        host = '(H)' in text_of(th.group(1))
        nums = []
        for td in re.findall(r'<td[^>]*>(.*?)</td>', row, re.S):
            t = re.sub(r'\[.*?\]', '', text_of(td)).replace('−', '-').replace('+', '').strip()
            if re.fullmatch(r'-?\d+', t): nums.append(int(t))
        if len(nums) >= 8:
            pld, w, d, l, gf, ga, gd, pts = nums[-8:] if len(nums) == 8 else nums[1:9]
            rows.append(dict(team=team, host=host, pld=pld, w=w, d=d, l=l,
                             gf=gf, ga=ga, gd=gd, pts=pts))
    return rows


def main():
    groups = {}
    for g in "ABCDEFGHIJKL":
        page = fetch(f"https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_Group_{g}")
        fixtures = parse_footballboxes(page)
        for f in fixtures:
            f.pop('pos', None); f.pop('aet', None); f.pop('pens', None)
        standings = parse_standings(page)
        if len(standings) != 4 or len(fixtures) != 6:
            print(f"ABORT: group {g} parsed {len(standings)} teams / {len(fixtures)} fixtures", file=sys.stderr)
            return 1
        ps = sum(r['pts'] for r in standings)
        if not (12 <= ps <= 18):
            print(f"ABORT: group {g} points sum {ps} implausible", file=sys.stderr)
            return 1
        groups[g] = dict(standings=standings, fixtures=sorted(fixtures, key=lambda f: f['date'] or ''))
        time.sleep(0.4)

    page = fetch("https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage")
    heads = [(hm.start(), hm.group(1)) for hm in re.finditer(r'<h[23][^>]*id="([^"]+)"[^>]*>', page)]
    RMAP = [('Round_of_32', 'R32'), ('Round_of_16', 'R16'), ('Quarter-finals', 'QF'), ('Quarterfinals', 'QF'),
            ('Semi-finals', 'SF'), ('Semifinals', 'SF'), ('Third_place', '3P'), ('Bronze', '3P'), ('Final', 'F')]

    def round_for(pos):
        last = None
        for hpos, hid in heads:
            if hpos < pos:
                for k, c in RMAP:
                    if hid.startswith(k) or k in hid: last = c
        return last

    ko = []
    for b in parse_footballboxes(page):
        r = round_for(b['pos']); b.pop('pos'); b['round'] = r
        ko.append(b)

    from collections import Counter
    counts = Counter(x['round'] for x in ko)
    if counts != Counter({'R32': 16, 'R16': 8, 'QF': 4, 'SF': 2, '3P': 1, 'F': 1}):
        print(f"ABORT: knockout shape unexpected: {dict(counts)}", file=sys.stderr)
        return 1

    base = {'R32': 73, 'R16': 89, 'QF': 97, 'SF': 101, '3P': 103, 'F': 104}
    seen = {}
    for m in ko:
        m['n'] = base[m['round']] + seen.get(m['round'], 0)
        seen[m['round']] = seen.get(m['round'], 0) + 1

    def winner(m):
        if m['hs'] is None: return None
        if m['hs'] > m['aws']: return m['home']
        if m['aws'] > m['hs']: return m['away']
        if m['pens']: return m['home'] if m['pens'][0] > m['pens'][1] else m['away']
        return None

    by_n = {m['n']: m for m in ko}

    def feeds(parent):
        prev = {'F': 'SF', 'SF': 'QF', 'QF': 'R16', 'R16': 'R32'}.get(parent['round'])
        if not prev: return [None, None]
        out = []
        for side in ('home', 'away'):
            t = parent[side]; feed = None
            lm = re.search(r'Match (\d+)', str(t) or '')
            if lm:
                feed = int(lm.group(1))
            else:
                for c in ko:
                    if c['round'] == prev and winner(c) == t: feed = c['n']; break
            out.append(feed)
        return out

    for m in ko:
        if m['round'] in ('R16', 'QF', 'SF', 'F'):
            m['feeds'] = feeds(m)
        if m['round'] != '3P':
            m['w'] = winner(m)

    bad = [m['n'] for m in ko if m['round'] in ('R16', 'QF', 'SF', 'F') and (None in m.get('feeds', [None]))]
    if bad:
        print(f"ABORT: unresolved bracket feeds for matches {bad}", file=sys.stderr)
        return 1

    F = next(m for m in ko if m['round'] == 'F')

    def subtree_cols(root_n, rounds):
        cols, level = {}, [root_n]
        for r in rounds:
            nxt = []
            for n in level:
                nxt += [x for x in by_n[n].get('feeds', [None, None]) if x]
            if nxt: cols[r] = nxt
            level = nxt
        return cols

    leftN, rightN = F['feeds']
    left = subtree_cols(leftN, ['QF', 'R16', 'R32']); left['SF'] = [leftN]
    right = subtree_cols(rightN, ['QF', 'R16', 'R32']); right['SF'] = [rightN]

    out = dict(groups=groups, ko={str(m['n']): m for m in ko},
               bracket=dict(final=F['n'], thirdPlace=103, left=left, right=right),
               codes=CODES)
    with open(OUT, "w") as f:
        f.write("window.WC = ")
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        f.write(";\n")
    played = sum(1 for m in ko if m.get('w'))
    print(f"OK: wrote {OUT.name} — {played}/31 knockout results in")
    return 0


if __name__ == "__main__":
    sys.exit(main())
