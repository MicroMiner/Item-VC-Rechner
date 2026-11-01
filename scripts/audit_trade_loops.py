#!/usr/bin/env python3
"""Read-only audit of actual quotes, including multi-output trade/recipe cycles.

Requires scipy for the independent linear-programming check. Does not reprice.
"""
import argparse
import hashlib
import itertools
import json
from decimal import Decimal
from pathlib import Path

import balance_prices as model

ROOT=Path(__file__).resolve().parents[1]
D=lambda x:Decimal(str(x))


def operation(name,inputs,outputs,kind):
    return {'name':name,'inputs':inputs,'outputs':outputs,'kind':kind}


def load_operations(payload,prices):
    # Recipe definitions only. Actual prices always come from the file being
    # audited, never from newly generated model proposals.
    _,recipes,*_=model.build_model(payload)
    operations=[];excluded=[]
    for r in recipes:
        if r['type']=='analogy':
            excluded.append(r['name']);continue
        groups=[list(i['items']) for i in r['inputs']]
        for choice in itertools.product(*groups):
            ingredients={}
            for name,i in zip(choice,r['inputs']):
                ingredients[name]=ingredients.get(name,D(0))+D(i['count'])
            outputs={r['output']:D(r['count'])}
            for item,count in r.get('returns',{}).items():
                outputs[item]=outputs.get(item,D(0))+D(count)
            # Vanilla crafting remainders. A returned container is an actual
            # additional output, not a separate exclusive crafting alternative.
            if not r.get('returns') and r['type'] in ['crafting_shaped','crafting_shapeless']:
                for item,container in [('MILK_BUCKET','BUCKET'),('HONEY_BOTTLE','GLASS_BOTTLE'),('WATER_BUCKET','BUCKET'),('LAVA_BUCKET','BUCKET')]:
                    if item in ingredients:
                        outputs[container]=outputs.get(container,D(0))+ingredients[item]
            operations.append(operation(r['name']+' ['+','.join(choice)+']',ingredients,outputs,r['type']))
    additions=[]
    def add(name,inputs,outputs,kind='additional_mechanic'):
        additions.append(operation(name,{k:D(v) for k,v in inputs.items()},{k:D(v) for k,v in outputs.items()},kind))
    for item in sorted(prices):
        if item.startswith('ENCHANTED_BOOK_') and 'CURSE' not in item:
            add('grindstone_'+item.lower(),{item:1},{'BOOK':1})
    add('grindstone_unspecified_enchanted_book',{'ENCHANTED_BOOK':1},{'BOOK':1},'conditional_unspecified_enchantment')
    add('lava_fuel_with_bucket_return',{'LAVA_BUCKET':1},{'FUEL_UNIT':100,'BUCKET':1})
    for fish in ['COD','SALMON','PUFFERFISH','TROPICAL_FISH']:
        add('release_and_kill_'+fish.lower(),{fish+'_BUCKET':1},{'BUCKET':1,fish:1})
    for mob in ['AXOLOTL','TADPOLE']:
        add('release_'+mob.lower(),{mob+'_BUCKET':1},{'BUCKET':1})
    for meal in ['MUSHROOM_STEW','RABBIT_STEW','BEETROOT_SOUP','SUSPICIOUS_STEW']:
        add('eat_'+meal.lower(),{meal:1},{'BOWL':1})
    add('honey_bottle_drinking',{'HONEY_BOTTLE':1},{'GLASS_BOTTLE':1})
    add('water_potion_drinking',{'POTION':1},{'GLASS_BOTTLE':1})
    for item in prices:
        if item.startswith('POTION_OF_'):
            add('drink_'+item.lower(),{item:1},{'GLASS_BOTTLE':1})
    # Copying requires an existing reusable original. It is a capital prerequisite,
    # not a consumed input. Capacity/time-dependent farms are not included.
    add('written_book_copy',{'WRITABLE_BOOK':1},{'WRITTEN_BOOK':1},'reusable_original_required')
    add('filled_map_copy',{'MAP':1},{'FILLED_MAP':1},'reusable_original_required')
    for item in ['WHITE_BANNER','ORANGE_BANNER','MAGENTA_BANNER','LIGHT_BLUE_BANNER','YELLOW_BANNER','LIME_BANNER','PINK_BANNER','GRAY_BANNER','LIGHT_GRAY_BANNER','CYAN_BANNER','PURPLE_BANNER','BLUE_BANNER','BROWN_BANNER','GREEN_BANNER','RED_BANNER','BLACK_BANNER']:
        # Pattern copying does not change the generic material price.
        if item in prices:
            add('pattern_copy_'+item.lower(),{item:1},{item:1},'reusable_original_required')
    # Free water access, after which no invented service fee may hide a loop.
    add('water_filling',{'BUCKET':1},{'WATER_BUCKET':1},'water_access_required')
    add('water_bottle_filling',{'GLASS_BOTTLE':1},{'POTION':1},'water_access_required')
    add('amethyst_cluster_max_drop',{'AMETHYST_CLUSTER':1},{'AMETHYST_SHARD':4},'maximum_drop')
    for mushroom in ['BROWN_MUSHROOM','RED_MUSHROOM']:
        add('max_drop_'+mushroom.lower()+'_block',{mushroom+'_BLOCK':1},{mushroom:2},'maximum_drop')
    add('cobweb_to_string',{'COBWEB':1},{'STRING':1})
    add('gravel_to_flint',{'GRAVEL':1},{'FLINT':1},'maximum_drop')
    add('decorated_pot_brick_recovery',{'DECORATED_POT':1},{'BRICK':4},'plain_pot_required')
    # No shop purchase is assumed for virtual service tokens. Only fuel generated
    # by actual fuel items is available. Water fees are removed through the
    # explicit filling operations above; other invented services are excluded.
    invalid={'WATER_SERVICE','LAVA_SERVICE','WRITING_SERVICE'}
    base=[r for r in operations if not invalid.intersection(r['inputs'])]
    return base,additions,excluded


def solve(prices,operations,budget=10000):
    import numpy as np
    from scipy.optimize import linprog
    from scipy.sparse import coo_matrix
    names=sorted(set(prices)|{k for r in operations for side in ['inputs','outputs'] for k in r[side]})
    index={name:i for i,name in enumerate(names)}
    variables=[]
    for item,p in sorted(prices.items()):
        variables.append({'name':'buy '+item,'inputs':{},'outputs':{item:D(1)},'cash':p['buy'],'kind':'buy'})
        variables.append({'name':'sell '+item,'inputs':{item:D(1)},'outputs':{},'cash':-p['sell'],'kind':'sell'})
    variables.extend({**r,'cash':D(0)} for r in operations)
    row=[];col=[];values=[]
    for j,r in enumerate(variables):
        for name,count in r['inputs'].items():
            row.append(index[name]);col.append(j);values.append(float(count))
        for name,count in r['outputs'].items():
            row.append(index[name]);col.append(j);values.append(-float(count))
        if r['kind']=='buy':
            row.append(len(names));col.append(j);values.append(float(r['cash']))
    matrix=coo_matrix((values,(row,col)),shape=(len(names)+1,len(variables))).tocsr()
    rhs=np.zeros(len(names)+1);rhs[-1]=budget
    objective=np.array([float(r['cash']) for r in variables])
    result=linprog(objective,A_ub=matrix,b_ub=rhs,bounds=(0,None),method='highs')
    if result.status!=0:
        return {'status':result.message,'solverStatus':int(result.status)}
    used=[{k:v for k,v in variables[j].items() if k not in ['inputs','outputs','cash']}|{'quantity':float(q),'cashFlow':float(variables[j]['cash'])*q} for j,q in enumerate(result.x) if q>1e-7]
    return {'status':'optimal','profit':max(0,float(-result.fun)),'budget':budget,'operationCount':len(operations),'materialCount':len(names),'activeOperations':used}


def audit(payload):
    prices={};direct=[];numeric=[]
    for item in payload['items']+payload['customItems']:
        key=model.canonical(item['id'])
        if item['id'].startswith('CUSTOM_') and item['name'].casefold()=='enderperle':key='ENDER_PEARL'
        buy,sell=D(item['buy']),D(item['sell'])
        if not buy.is_finite() or not sell.is_finite() or not D('.01')<=sell<=buy<=D(500000) or buy!=4*sell:
            numeric.append(item['id'])
        if key not in prices:
            prices[key]={'buy':buy,'sell':sell}
        else:
            prices[key]['buy']=min(prices[key]['buy'],buy)
            prices[key]['sell']=max(prices[key]['sell'],sell)
    for key,p in prices.items():
        if p['sell']>p['buy']:
            direct.append({'item':key,'profit':float(p['sell']-p['buy'])})
    base,additional,excluded=load_operations(payload,prices)
    # Directly executable, integer examples, including sale of all byproducts.
    examples=[]
    for item in prices:
        if item.startswith('ENCHANTED_BOOK_') and 'CURSE' not in item and prices[item]['buy']<prices['BOOK']['sell']:
            examples.append({'name':'grindstone_'+item.lower(),'buy':{item:1},'sell':{'BOOK':1},'cost':float(prices[item]['buy']),'revenue':float(prices['BOOK']['sell']),'profit':float(prices['BOOK']['sell']-prices[item]['buy']),'prerequisite':'Existing grindstone; curse-only books cannot be disenchanted.'})
    cost=100*prices['SAND']['buy']+prices['LAVA_BUCKET']['buy']
    revenue=100*prices['GLASS']['sell']+prices['BUCKET']['sell']
    if revenue>cost:
        examples.append({'name':'100_glass_with_lava','buy':{'SAND':100,'LAVA_BUCKET':1},'sell':{'GLASS':100,'BUCKET':1},'cost':float(cost),'revenue':float(revenue),'profit':float(revenue-cost),'prerequisite':'Existing furnace; one lava bucket smelts 100 items and returns its bucket.'})
    # Whole batches: 240 bottles use three coal blocks (240 smelts).
    # Weakness needs 80 brewing operations, infestation needs 160; one blaze
    # powder fuels twenty operations. Water is actually free at a water source.
    for potion,extra_inputs,blaze in [
        ('POTION_OF_WEAKNESS',{'BROWN_MUSHROOM':80,'SPIDER_EYE':80,'SUGAR':80},4),
        ('POTION_OF_INFESTATION',{'NETHER_WART':80,'STONE':80},8)]:
        inputs={'SAND':240,'COAL_BLOCK':3,'BLAZE_POWDER':blaze,**extra_inputs}
        cost=sum(prices[k]['buy']*n for k,n in inputs.items())
        revenue=prices[potion]['sell']*240
        if revenue>cost:
            examples.append({'name':'brew_240_'+potion.lower(),'buy':inputs,'sell':{potion:240},'cost':float(cost),'revenue':float(revenue),'profit':float(revenue-cost),'prerequisite':'Existing furnace, brewing stand, crafting table and water source; whole fuel and brewing batches, no assumed mushroom drops.'})
    deterministic_base=[r for r in base if r['kind'] not in ['maximum_drop','modeled_maximum_drop']]
    baseline=solve(prices,deterministic_base)
    deterministic=[r for r in additional if r['kind']!='maximum_drop']
    expanded=solve(prices,deterministic_base+deterministic)
    worst_case=solve(prices,base+additional)
    # Isolate every known finding and check for further routes after removing
    # those mechanics. This does not change prices or claim fixes were applied.
    removed={'grindstone_'+item.lower() for item in prices if item.startswith('ENCHANTED_BOOK_') and 'CURSE' not in item and prices[item]['buy']<prices['BOOK']['sell']}
    removed.update({'lava_fuel_with_bucket_return','water_bottle_filling'})
    remaining=solve(prices,base+[r for r in additional if r['name'] not in removed])
    return {'schema':1,'priceSha256':hashlib.sha256(json.dumps(payload,ensure_ascii=False,sort_keys=True).encode()).hexdigest(),'scope':{'itemCount':len(payload['items'])+len(payload['customItems']),'canonicalMarkets':len(prices),'baseOperations':len(base),'additionalOperations':len(additional),'excludedAnalogyRecipes':len(excluded),'minecraftVersion':'1.21.11','usesActualJsonPrices':True},'numericViolations':numeric,'directBuySellLoops':direct,'confirmedExamples':examples,'baselineLinearCheck':baseline,'expandedLinearCheck':expanded,'maximumDropScenarioCheck':worst_case,'checkWithKnownMechanicsRemoved':remaining,'limitations':['Actual Minecraft shop configuration and NBT matching were not supplied. Book/potion/arrow variants must be distinguished by metadata, not just material or display name.','Unknown plugin recipes, alternative server versions, repair/XP and time-dependent farms or villager trading are not covered.','Linear optimization allows fractional batches and reusable capital; quoted examples above use executable whole quantities.','Removing known mechanics isolates findings; it is not a price fix or a claim that the deployed economy is safe.'],'excludedRecipes':excluded}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',default=str(ROOT/'pricing/security-audit.json'));args=parser.parse_args()
    payload=json.loads(model.PRICE_FILE.read_text());report=audit(payload)
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['scope','numericViolations','directBuySellLoops','confirmedExamples']},indent=2))
    for name in ['baselineLinearCheck','expandedLinearCheck','maximumDropScenarioCheck','checkWithKnownMechanicsRemoved']:
        r=report[name];print(name,r['status'],'profit',r.get('profit'))
    if any(report[k]['status']!='optimal' for k in ['baselineLinearCheck','expandedLinearCheck','maximumDropScenarioCheck','checkWithKnownMechanicsRemoved']):
        return 2
    return 1 if report['confirmedExamples'] or report['numericViolations'] or report['directBuySellLoops'] or any(report[k].get('profit',0)>.000001 for k in ['baselineLinearCheck','expandedLinearCheck','maximumDropScenarioCheck','checkWithKnownMechanicsRemoved']) else 0

if __name__=='__main__':
    raise SystemExit(main())
