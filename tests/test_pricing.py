import csv
import importlib.util
import json
import re
import unittest
from decimal import Decimal
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('pricing_model',ROOT/'scripts/balance_prices.py')
model=importlib.util.module_from_spec(spec);spec.loader.exec_module(model)

class PricingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload=json.loads((ROOT/'preislisten/VeloCoin_Preisliste.json').read_text())
        cls.items={i['id']:i for i in cls.payload['items']+cls.payload['customItems']}
        cls.audit=json.loads((ROOT/'pricing/report.json').read_text())
        cls.proposed,cls.recipes,cls.acquisition,*_=model.build_model(cls.payload)

    def test_all_prices_are_cent_values_below_balance_limit(self):
        self.assertEqual(len(self.items),len(self.payload['items'])+len(self.payload['customItems']))
        self.assertGreaterEqual(len(self.items),1435)
        for name,item in self.items.items():
            with self.subTest(item=name):
                self.assertRegex(name,r'^(?:[A-Z][A-Z0-9_]*|CUSTOM_[a-zA-Z0-9_-]+)$')
                for field in ['buy','sell','defaultBuy','defaultSell']:
                    value=Decimal(str(item[field]))
                    self.assertTrue(value.is_finite())
                    self.assertGreaterEqual(value,Decimal('.01'))
                    self.assertLessEqual(value,Decimal('500000'))
                    self.assertEqual(value*100,(value*100).to_integral_value())
                self.assertLessEqual(item['sell'],item['buy'])
                self.assertEqual(item['buy'],item['defaultBuy'])
                self.assertEqual(item['sell'],item['defaultSell'])

    def test_buy_ceiling_preserves_margins_and_is_documented(self):
        self.assertEqual(self.items['ELYTRA']['buy'],500000)
        self.assertEqual(self.items['ELYTRA']['sell'],50000)
        self.assertEqual(self.items['DRAGON_EGG']['buy'],500000)
        self.assertEqual(self.items['DRAGON_EGG']['sell'],50000)
        self.assertEqual(self.items['NETHERITE_BLOCK']['buy'],500000)
        self.assertEqual(self.items['NETHERITE_BLOCK']['sell'],5000)
        capped={x['id'] for x in self.audit['summary']['buyCaps']}
        self.assertEqual(capped,{'ELYTRA','DRAGON_EGG','NETHERITE_BLOCK'})

    def test_material_quantities_and_netherite_upgrade(self):
        self.assertEqual(self.items['DIAMOND']['buy'],1500)
        self.assertEqual(self.items['DIAMOND']['sell'],500)
        self.assertEqual(self.items['DIRT']['buy'],3)  # Existing explicit change.
        self.assertEqual(self.items['OAK_SLAB']['buy'],22)  # 3 planks -> 6 slabs, one 10% fee.
        self.assertEqual(self.items['OAK_STAIRS']['buy'],66)  # 6 planks -> 4 stairs.
        self.assertEqual(self.items['IRON_CHESTPLATE']['buy'],2200)
        # One netherite ingot, one diamond chestplate and one consumed upgrade
        # template; never eight netherite ingots or a repeated tier multiplier.
        chest=self.items['NETHERITE_CHESTPLATE']
        self.assertLess(chest['buy'],150000)
        self.assertGreater(chest['buy'],self.items['NETHERITE_INGOT']['buy'])
        self.assertLess(chest['sell'],10000)

    def test_known_purchase_conversion_loops_are_closed(self):
        self.assertLessEqual(self.items['GLOWSTONE_DUST']['sell']*4,self.items['GLOWSTONE']['buy']*.9)
        self.assertLessEqual(self.items['COAL']['sell']*9,self.items['COAL_BLOCK']['buy']*.9)
        self.assertLessEqual(self.items['LODESTONE']['sell'],self.acquisition['LODESTONE']*Decimal('.9'))
        self.assertLessEqual(self.items['END_CRYSTAL']['sell'],self.acquisition['END_CRYSTAL']*Decimal('.9'))
        checked=0
        for r in self.recipes:
            if r['output'] not in self.proposed:
                continue
            choices=[]
            for ingredient in r['inputs']:
                available=[self.acquisition[k] for k in ingredient['items'] if k in self.acquisition]
                if not available:
                    break
                choices.append(min(available)*Decimal(str(ingredient['count'])))
            else:
                cost=sum(choices,Decimal(0))
                payout=self.proposed[r['output']]['sell']*Decimal(str(r['count']))
                with self.subTest(recipe=r['name']):
                    self.assertLessEqual(payout,cost*Decimal('.9')+Decimal('.0000001'))
                checked+=1
        self.assertGreater(checked,1000)

    def test_variants_do_not_overwrite_each_other_and_assumptions_are_visible(self):
        self.assertEqual(sum(i.startswith('ENCHANTED_BOOK_') for i in self.items),42)
        self.assertEqual(sum(i.startswith('POTION_OF_') for i in self.items),19)
        self.assertEqual(sum(i.startswith('TIPPED_ARROW_') for i in self.items),19)
        self.assertNotEqual(self.items['ENCHANTED_BOOK_MENDING_1']['buy'],self.items['ENCHANTED_BOOK_AQUA_AFFINITY_1']['buy'])
        self.assertEqual(self.items['ENCHANTED_BOOK_BINDING_CURSE_1']['sell'],.01)
        self.assertEqual(len(self.audit['summary']['inferredCsvSales']),12)
        # Synthetic IDs from the original catalog use explicit analogues; no
        # assertion that Minecraft has wool stairs or poplar crafting recipes.
        wool=next(i for i in self.audit['items'] if i['id']=='WHITE_WOOL_STAIRS')
        self.assertEqual(wool['recipeType'],'analogy')
        custom=next(i for i in self.payload['customItems'] if i['name']=='Enderperle')
        self.assertEqual((custom['buy'],custom['sell']),(120,30))

    def test_model_is_repeatable_without_price_inflation(self):
        result,*_=model.generate(self.payload)
        self.assertEqual(result,self.payload)

if __name__=='__main__':
    unittest.main()
