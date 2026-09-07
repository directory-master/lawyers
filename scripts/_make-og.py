# Regenerates assets/og.png (1200x630 social card). Run: python3 scripts/_make-og.py
# Kept as a script so the card can be re-rendered if the brand copy changes.
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
INK=(26,26,31); GILT=(168,137,60); GILT_SOFT=(194,167,94); WHITE=(255,255,255)
def temple(d, ox, oy, s, fill):
    def R(x,y,w,h): d.rounded_rectangle([ox+x*s, oy+y*s, ox+(x+w)*s, oy+(y+h)*s], radius=max(1,2*s), fill=fill)
    d.polygon([(ox+256*s,oy+144*s),(ox+372*s,oy+200*s),(ox+140*s,oy+200*s)], fill=fill)
    R(150,206,212,24)
    for x in (157,215,271,329): R(x,238,26,96)
    R(150,340,212,22); R(132,366,248,24)
W,H=1200,630
im=Image.new('RGB',(W,H),INK)
glow=Image.new('L',(W,H),0); gd=ImageDraw.Draw(glow); gd.ellipse([W*0.55,-H*0.6,W*1.35,H*0.7],fill=90); glow=glow.filter(ImageFilter.GaussianBlur(120))
im.paste(Image.new('RGB',(W,H),GILT),(0,0),glow)
mark=Image.new('RGBA',(W,H),(0,0,0,0)); md=ImageDraw.Draw(mark); temple(md,W-560,40,1.05,GILT+(46,)); im.paste(mark,(0,0),mark)
d=ImageDraw.Draw(im)
def font(sz,serif=True):
    for f in (['/System/Library/Fonts/Supplemental/Georgia Bold.ttf','/System/Library/Fonts/Supplemental/Georgia.ttf'] if serif else ['/System/Library/Fonts/Supplemental/Arial.ttf','/System/Library/Fonts/Helvetica.ttc']):
        if os.path.exists(f):
            try: return ImageFont.truetype(f,sz)
            except Exception: pass
    return ImageFont.load_default()
d.rectangle([80,178,110,180],fill=GILT_SOFT)
d.text((122,166),"GEORGIA, STATEWIDE",fill=GILT_SOFT,font=font(20,False))
d.text((80,206),"Georgia Lawyer",fill=WHITE,font=font(86))
d.text((80,300),"Directory",fill=WHITE,font=font(86))
d.text((80,418),"Compare lawyers and law firms across Georgia",fill=(240,240,244),font=font(30,False))
d.text((80,460),"by city, county, ZIP or practice area.",fill=(230,230,235),font=font(30,False))
d.rectangle([80,540,132,543],fill=GILT_SOFT)
d.text((80,556),"lawyers.artivicolab.com",fill=GILT_SOFT,font=font(22,False))
os.makedirs('assets',exist_ok=True); im.save('assets/og.png',optimize=True)
print('wrote assets/og.png', os.path.getsize('assets/og.png'))
