#!/usr/bin/env python3
"""Build a reproducible price proposal from CSV anchors and versioned recipe data.

No network calls. Use --check to validate without changing any files.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import json
import re
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP, localcontext
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
PRICE_FILE = ROOT / 'preislisten/VeloCoin_Preisliste.json'
SOURCE_FILE = ROOT / 'pricing/sources/shops.csv'
RECIPE_FILE = ROOT / 'pricing/sources/recipes.json'
POLICY_FILE = ROOT / 'pricing/policy.json'
D = lambda v: Decimal(str(v))
CENT = D('.01')
WOODS = ['OAK','SPRUCE','BIRCH','JUNGLE','ACACIA','DARK_OAK','MANGROVE','CHERRY','PALE_OAK','CRIMSON','WARPED','BAMBOO','POPLAR']
COLORS = ['WHITE','ORANGE','MAGENTA','LIGHT_BLUE','YELLOW','LIME','PINK','GRAY','LIGHT_GRAY','CYAN','PURPLE','BLUE','BROWN','GREEN','RED','BLACK']


def canonical(name):
    if name.startswith('CUSTOM_'):
        return name
    fixed = {'CHAIN':'IRON_CHAIN','COPPER':'COPPER_BLOCK','WAXED_COPPER':'WAXED_COPPER_BLOCK',
             'MANGROVE_SAPLING':'MANGROVE_PROPAGULE','BAMBOO_BOAT':'BAMBOO_RAFT',
             'BAMBOO_CHEST_BOAT':'BAMBOO_CHEST_RAFT','GRASS':'SHORT_GRASS','SPEAR':'IRON_SPEAR'}
    if name in fixed:
        return fixed[name]
    for wood in WOODS:
        if wood not in ['CRIMSON','WARPED','BAMBOO']:
            for old,new in [('_STEM','_LOG'),('_HYPHAE','_WOOD')]:
                if name==wood+old:
                    return wood+new
                if name==wood+'_STRIPPED'+old:
                    return 'STRIPPED_'+wood+new
        if name.startswith(wood+'_STRIPPED_'):
            return 'STRIPPED_'+wood+'_'+name[len(wood+'_STRIPPED_'):]
    return name


def money(value,up=False):
    nearest=value.quantize(CENT,rounding=ROUND_HALF_UP)
    if abs(value-nearest)<D('.00000001'):
        value=nearest
    return max(CENT,value.quantize(CENT,rounding=ROUND_CEILING if up else ROUND_FLOOR))


def slug(name):
    return re.sub(r'[^A-Z0-9]+','_',name.upper()).strip('_')


def recipe(name,output,inputs,count=1,kind='analogy'):
    return {'name':name,'type':kind,'output':output,'count':count,
            'inputs':[{'items':[item],'count':qty} for item,qty in inputs.items()]}


def recipe_cost(r,values):
    total=D(0)
    for ingredient in r['inputs']:
        choices=[values[x] for x in ingredient['items'] if x in values]
        if not choices:
            return None
        total+=min(choices)*D(ingredient['count'])
    return total/D(r['count'])


def relax(seeds,recipes,locked=frozenset()):
    """Least-cost fixed point; outputs are per item, never per crafting batch.

    Prices have no compounding processing multiplier inside this graph.
    """
    values=dict(seeds)
    chosen={k:'reference' for k in seeds}
    for iteration in range(250):
        changed=False
        for r in recipes:
            output=r['output']
            if output in locked:
                continue
            cost=recipe_cost(r,values)
            if cost is not None and cost>0 and (output not in values or cost<values[output]-D('.000000001')):
                values[output]=cost;chosen[output]=r['name'];changed=True
        if not changed:
            return values,chosen
    raise ValueError('Preisgraph konvergiert nicht; Rezeptzyklen prüfen.')


def fallback(item,anchors,policy):
    """Explicit analogues for non-craftable/unsupported entries, never old prices."""
    if item in policy['fallbacks']:
        return (*map(D,policy['fallbacks'][item]),'explicit_reference')
    if item.endswith('_SMITHING_TEMPLATE'):
        return D(20000),D(2000),'template_reference'
    if item.endswith('_POTTERY_SHERD'):
        return D(250),D(25),'archaeology_reference'
    if item.startswith('MUSIC_DISC_'):
        return D(2500),D(250),'music_reference'
    if item.endswith('_SPAWN_EGG'):
        return D(2500),D(250),'spawn_egg_reference'
    if item.endswith('_SKULL') or item.endswith('_HEAD'):
        return D(2500),D(250),'trophy_reference'
    if item.endswith('_LEAVES'):
        return D(30),D(3),'foliage_reference'
    if item.endswith('_SAPLING') or item.endswith('_FUNGUS') or item.endswith('_PROPAGULE'):
        return D(35),D('3.5'),'plant_reference'
    if item.endswith('_NYLIUM'):
        return D(30),D(3),'soil_reference'
    if item.endswith('_BANNER_PATTERN'):
        return D(250),D(25),'pattern_reference'
    # All remaining unpriced items must be reviewed explicitly, never silently
    # filled using an inflated old value or a universal buy/sell ratio.
    return None


def build_model(current):
    policy=json.loads(POLICY_FILE.read_text())
    maximum_buy=D(policy['maximumBuy'])
    if not maximum_buy.is_finite() or maximum_buy<CENT:
        raise ValueError('Ungültiger maximaler Buy-Preis.')
    buy_caps=[]
    data=json.loads(RECIPE_FILE.read_text())
    recipes=list(data['recipes'])
    rows=list(csv.DictReader(io.StringIO(SOURCE_FILE.read_text(encoding='utf-8-sig'))))
    grouped=defaultdict(list)
    for n,row in enumerate(rows,2):
        row['_line']=n;grouped[canonical(row['key'].upper())].append(row)
    anchors={};anchor_info={};new_entries={};inferred=[]
    for key,group in grouped.items():
        distinct={row['name'] for row in group}
        variants=len(distinct)>1 and key in ['ENCHANTED_BOOK','POTION','TIPPED_ARROW']
        for row in (group if variants else group[:1]):
            clean=re.sub(r'&[0-9a-fk-or]','',row['name'],flags=re.I)
            item=slug(clean) if variants else key
            amount=D(row['amount']);buy=D(row['buy'])/amount
            sell=D(row['sell'])/amount if row['sell'] else buy*D('.1')
            if not row['sell'] or sell<=0:
                inferred.append({'id':item,'csvLine':row['_line'],'reason':'CSV sell missing' if not row['sell'] else 'CSV sell zero','proposedSell':float(max(CENT,sell))})
            anchors[item]=(money(buy,True),money(sell))
            anchor_info[item]={'csvLine':row['_line'],'csvBuy':float(buy),'csvSell':None if not row['sell'] else float(D(row['sell'])/amount),'shop':row['shop'],'name':clean}
            new_entries[item]={'id':item,'name':clean}
        if variants:
            # Plain, unspecified material cannot stand for 19/42 different goods.
            # Keep its existing ID as an explicit unenchanted/base analogue.
            pass
    for item,prices in policy['overrides'].items():
        anchors[item]=tuple(map(D,prices))
    # Explicit seed estimates are used only if no CSV anchor exists.
    seeds={k:v for k,v in anchors.items()}
    reasons={k:'csv' for k in anchors}
    reasons.update({k:'manual_override' for k in policy['overrides']})
    targets={canonical(i['id']) for i in current['items']}
    targets.update(anchors)
    for item,prices in policy['fallbacks'].items():
        if item not in seeds:
            seeds[item]=tuple(map(D,prices));reasons[item]='explicit_reference'
    for item in sorted(targets):
        if item in seeds:
            continue
        f=fallback(item,anchors,policy)
        if f:
            seeds[item]=(f[0],f[1]);reasons[item]=f[2]
    # Apply the ceiling before deriving descendants. Retain the reference's
    # trade margin by scaling its Sell along with a reduced Buy.
    for item,(buy,sell) in list(seeds.items()):
        if buy>maximum_buy:
            new_sell=money(sell*maximum_buy/buy)
            buy_caps.append({'id':item,'beforeBuy':float(buy),'afterBuy':float(maximum_buy),'beforeSell':float(sell),'afterSell':float(new_sell)})
            seeds[item]=(maximum_buy,new_sell)
            if item in anchors:
                anchors[item]=seeds[item]
    # Modeled equivalents for IDs from the existing list that are not vanilla.
    for wood in WOODS:
        trunk=wood+('_STEM' if wood in ['CRIMSON','WARPED'] else '_LOG')
        for suffix in ['STEM','HYPHAE']:
            target=wood+'_'+suffix
            if target!=trunk:
                base=trunk if suffix=='STEM' else wood+'_WOOD'
                recipes.append(recipe('analogue_'+target.lower(),target,{base:1}))
            stripped='STRIPPED_'+wood+'_'+suffix
            base='STRIPPED_'+wood+('_LOG' if suffix=='STEM' else '_WOOD')
            if stripped!=base and wood not in ['CRIMSON','WARPED']:
                recipes.append(recipe('analogue_'+stripped.lower(),stripped,{base:1}))
    # Poplar and wool/concrete shapes have no verified vanilla recipe. These
    # analogues are explicitly marked in the audit, not presented as vanilla.
    poplar_suffixes=['LOG','WOOD','PLANKS','SLAB','STAIRS','FENCE','FENCE_GATE','DOOR','TRAPDOOR','BUTTON','PRESSURE_PLATE','SIGN','HANGING_SIGN','BOAT','CHEST_BOAT']
    for suffix in poplar_suffixes:
        recipes.append(recipe('poplar_'+suffix.lower(),'POPLAR_'+suffix,{'OAK_'+suffix:1}))
    for suffix in ['LOG','WOOD']:
        recipes.append(recipe('poplar_stripped_'+suffix.lower(),'STRIPPED_POPLAR_'+suffix,{'STRIPPED_OAK_'+suffix:1}))
    for color in COLORS:
        for base in ['WOOL','CONCRETE']:
            recipes.append(recipe(color.lower()+'_'+base.lower()+'_slab_analogue',color+'_'+base+'_SLAB',{color+'_'+base:1},2))
            recipes.append(recipe(color.lower()+'_'+base.lower()+'_stairs_analogue',color+'_'+base+'_STAIRS',{color+'_'+base:6},4))
        recipes.append(recipe(color.lower()+'_cushion_analogue',color+'_CUSHION',{color+'_WOOL':2}))
    # Bucket filling and potion variants: contents incur a single explicit fee.
    recipes.extend([
        recipe('fill_water_bucket','WATER_BUCKET',{'BUCKET':1,'WATER_SERVICE':1},kind='modeled_service'),
        recipe('fill_powder_snow_bucket','POWDER_SNOW_BUCKET',{'BUCKET':1,'SNOW_BLOCK':1},kind='modeled_service'),
        recipe('fill_lava_bucket','LAVA_BUCKET',{'BUCKET':1,'LAVA_SERVICE':1},kind='modeled_service'),
        recipe('base_water_potion','POTION',{'GLASS_BOTTLE':1,'WATER_SERVICE':1},kind='modeled_service'),
        recipe('base_splash_potion','SPLASH_POTION',{'POTION':1,'GUNPOWDER':D(1)/3},kind='modeled_brewing'),
        recipe('base_lingering_potion','LINGERING_POTION',{'SPLASH_POTION':1,'DRAGON_BREATH':D(1)/3},kind='modeled_brewing'),
        recipe('base_tipped_arrow','TIPPED_ARROW',{'ARROW':8,'LINGERING_POTION':1},8,kind='modeled_brewing'),
        recipe('decorated_pot_bricks','DECORATED_POT',{'BRICK':4},kind='modeled_crafting'),
        recipe('written_book_analogue','WRITTEN_BOOK',{'WRITABLE_BOOK':1,'WRITING_SERVICE':1}),
        recipe('filled_map_analogue','FILLED_MAP',{'MAP':1,'WRITING_SERVICE':1}),
        recipe('firework_star_analogue','FIREWORK_STAR',{'GUNPOWDER':1,'WHITE_DYE':1}),
        recipe('stripped_crimson_leaves_analogue','CRIMSON_LEAVES',{'NETHER_WART_BLOCK':1}),
        recipe('stripped_warped_leaves_analogue','WARPED_LEAVES',{'WARPED_WART_BLOCK':1}),
    ])
    # Non-vanilla wall/slab variants retained from the old list use their block
    # family as an explicitly assumed material recipe.
    recipe_outputs={r['output'] for r in recipes}
    for item in sorted(targets-recipe_outputs-set(seeds)):
        for suffix,count,quantity in [('_WALL',6,6),('_SLAB',3,6),('_STAIRS',6,4)]:
            if item.endswith(suffix):
                base=item.removesuffix(suffix)
                for candidate in [base,base+'S',base+'_BLOCK']:
                    if candidate in targets or candidate in recipe_outputs:
                        recipes.append(recipe(item.lower()+'_shape_analogue',item,{candidate:count},quantity));break
                break
    # Brewing is hardcoded in vanilla rather than stored as datapack recipes.
    # A batch produces three potions; one blaze powder fuels twenty batches.
    def brew(name,output,base,ingredient):
        recipes.append(recipe(name,output,{base:1,ingredient:D(1)/3,'BLAZE_POWDER':D(1)/60},kind='modeled_brewing'))
    brew('awkward_potion','BREW_AWKWARD','POTION','NETHER_WART')
    ingredients={'SWIFTNESS':'SUGAR','STRENGTH':'BLAZE_POWDER','JUMP_BOOST':'RABBIT_FOOT',
                 'REGENERATION':'GHAST_TEAR','FIRE_RESISTANCE':'MAGMA_CREAM','WATER_BREATHING':'PUFFERFISH',
                 'NIGHT_VISION':'GOLDEN_CARROT','HEALING':'GLISTERING_MELON_SLICE','POISON':'SPIDER_EYE',
                 'SLOW_FALLING':'PHANTOM_MEMBRANE','TURTLE_MASTER':'TURTLE_HELMET','WIND_CHARGING':'BREEZE_ROD',
                 'WEAVING':'COBWEB','OOZING':'SLIME_BLOCK','INFESTATION':'STONE'}
    for effect,ingredient in ingredients.items():
        brew('brew_'+effect.lower(),'BREW_'+effect,'BREW_AWKWARD',ingredient)
    brew('brew_weakness','BREW_WEAKNESS','POTION','FERMENTED_SPIDER_EYE')
    for effect,base in [('SLOWNESS','SWIFTNESS'),('INVISIBILITY','NIGHT_VISION'),('HARMING','HEALING')]:
        brew('brew_'+effect.lower(),'BREW_'+effect,'BREW_'+base,'FERMENTED_SPIDER_EYE')
    for item in sorted(anchors):
        if not item.startswith('POTION_OF_'):
            continue
        effect=item.removeprefix('POTION_OF_')
        strong=effect.endswith('_II') or effect.endswith('_IV')
        base_effect=effect.rsplit('_',1)[0] if strong else effect
        if strong:
            brew('brew_'+item.lower(),item,'BREW_'+base_effect,'GLOWSTONE_DUST')
        else:
            recipes.append(recipe('brew_'+item.lower(),item,{'BREW_'+effect:1},kind='modeled_brewing'))
        arrow='TIPPED_ARROW_'+effect
        if arrow in anchors:
            splash='BREW_SPLASH_'+effect;lingering='BREW_LINGERING_'+effect
            brew('brew_'+splash.lower(),splash,item,'GUNPOWDER')
            brew('brew_'+lingering.lower(),lingering,splash,'DRAGON_BREATH')
            recipes.append(recipe('brew_'+arrow.lower(),arrow,{'ARROW':8,lingering:1},8,kind='modeled_brewing'))
    # Persist model inputs in policy rather than inheriting any old inflated value.
    locked={k for k in seeds if not k.endswith('_SMITHING_TEMPLATE')}
    buys,buy_recipe=relax({k:v[0] for k,v in seeds.items()},recipes,locked)
    sells,sell_recipe=relax({k:v[1] for k,v in seeds.items()},recipes,locked)
    missing=sorted(targets-set(buys)|targets-set(sells))
    if missing:
        raise ValueError('Explizite Referenzen fehlen: '+', '.join(missing))
    proposed={}
    recipe_types={r['name']:r['type'] for r in recipes}
    for item in sorted(targets):
        if item in anchors:
            buy,sell=anchors[item];method=reasons[item]
        elif buy_recipe.get(item)=='reference':
            buy,sell=seeds[item];method=reasons[item]
        else:
            buy=money(buys[item]*D(policy['processingBuyFactor']),True)
            sell=money(sells[item]*D(policy['processingSellFactor']))
            method='recipe' if buy_recipe.get(item)!='reference' else reasons.get(item,'explicit_reference')
        if buy>maximum_buy:
            new_sell=money(sell*maximum_buy/buy)
            buy_caps.append({'id':item,'beforeBuy':float(buy),'afterBuy':float(maximum_buy),'beforeSell':float(sell),'afterSell':float(new_sell)})
            buy,sell=maximum_buy,new_sell
        proposed[item]={'buy':buy,'sell':min(sell,buy),'method':method,'recipe':buy_recipe.get(item,'reference'),'recipeType':recipe_types.get(buy_recipe.get(item),'reference')}
    # Least attainable acquisition cost can also traverse CSV-anchored products.
    # Seed only actual tradable items, not intermediary guesses or service fees.
    acquisition_seeds={k:v['buy'] for k,v in proposed.items()}
    for name in policy['services']:
        acquisition_seeds[name]=D(policy['fallbacks'][name][0])
    acquisition,acq_recipe=relax(acquisition_seeds,recipes)
    corrections=[]
    for item,price in proposed.items():
        cap=money(acquisition[item]*D(policy['saleSafetyFactor']))
        if price['sell']>cap:
            corrections.append({'id':item,'before':float(price['sell']),'after':float(cap),'reason':acq_recipe.get(item),'acquisitionCost':float(acquisition[item])})
            price['sell']=cap
    # Recompute all derived resale values after correcting references. Thus
    # descendants inherit a correction without repeated discounts per stage.
    final_sell_seeds={k:v[1] for k,v in seeds.items()}
    for k in anchors:
        final_sell_seeds[k]=proposed[k]['sell']
    final_sells,_=relax(final_sell_seeds,recipes,locked)
    for item,price in proposed.items():
        if item not in anchors and price['method']=='recipe':
            price['sell']=min(price['sell'],money(final_sells[item]*D(policy['processingSellFactor'])))
    return proposed,recipes,acquisition,anchor_info,inferred,corrections,data,rows,buy_caps


def generate(current):
    proposed,recipes,acquisition,anchor_info,inferred,corrections,data,rows,buy_caps=build_model(current)
    # Copy existing identities/names while resetting defaults to this new baseline.
    result={k:v for k,v in current.items() if k not in ['items','customItems']}
    result['items']=[];result['customItems']=[];audit=[];seen=set()
    previous_report=ROOT/'pricing/report.json'
    previous={x['id']:x for x in json.loads(previous_report.read_text())['items']} if previous_report.exists() else {}
    def append(item,custom=False):
        key=canonical(item['id'])
        if custom and item['name'].strip().casefold()=='enderperle':
            key='ENDER_PEARL'
        price=proposed[key]
        buy,sell=price['buy'],price['sell']
        updated={**item,'buy':float(buy),'sell':float(sell),'defaultBuy':float(buy),'defaultSell':float(sell)}
        result['customItems' if custom else 'items'].append(updated);seen.add(key)
        prior=previous.get(item['id'],{})
        same_as_prior=(item.get('buy'),item.get('sell'))==(prior.get('buy'),prior.get('sell'))
        old_buy=prior.get('oldBuy') if same_as_prior else item.get('buy')
        old_sell=prior.get('oldSell') if same_as_prior else item.get('sell')
        audit.append({'id':item['id'],'name':item['name'],'canonical':key,'oldBuy':old_buy,'oldSell':old_sell,'buy':float(buy),'sell':float(sell),'method':price['method'],'recipe':price['recipe'],'recipeType':price['recipeType'],'acquisitionCost':float(acquisition[key])})
    for item in current['items']:
        append(item)
    for key,reference in anchor_info.items():
        if key not in seen:
            append({'id':key,'name':reference['name']})
    for item in current['customItems']:
        append(item,True)
    for item in result['items']+result['customItems']:
        assert CENT<=D(item['sell'])<=D(item['buy'])<=D(json.loads(POLICY_FILE.read_text())['maximumBuy']),item
    summary={'csvRows':len(rows),'csvUniquePriceReferences':len(anchor_info),'itemCount':len(audit),'changed':sum((a['oldBuy'],a['oldSell'])!=(a['buy'],a['sell']) for a in audit),'maxBuy':max(x['buy'] for x in audit),'maxSell':max(x['sell'] for x in audit),'buyCaps':buy_caps,'corrections':corrections,'inferredCsvSales':inferred,'minecraftVersion':data['minecraftVersion'],'recipeCount':len(recipes),'sourceSha256':hashlib.sha256(SOURCE_FILE.read_bytes()).hexdigest()}
    return result,audit,summary,recipes,acquisition


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    current=json.loads(PRICE_FILE.read_text())
    with localcontext() as ctx:
        ctx.prec=32
        result,audit,summary,recipes,acquisition=generate(current)
    if args.check:
        # Compare generated economic fields only, preserving audit's original
        # before-prices from the first successful generation.
        assert result==current,'Preisliste weicht vom reproduzierbaren Modell ab.'
        print('PASS: Preise reproduzierbar; Grenzen, Referenzen und Rezeptkosten geprüft.')
    else:
        PRICE_FILE.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        report=ROOT/'pricing/report.json'
        report.write_text(json.dumps({'summary':summary,'items':audit},ensure_ascii=False,indent=2)+'\n')
        with (ROOT/'pricing/price-changes.csv').open('w',newline='') as f:
            w=csv.DictWriter(f,fieldnames=list(audit[0]));w.writeheader();w.writerows(audit)
        print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
