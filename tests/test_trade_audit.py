"""Tests for the auditor, not assertions that the current economy is safe."""
import importlib.util
import json
import sys
import unittest
from decimal import Decimal
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import audit_trade_loops as audit

@unittest.skipUnless(importlib.util.find_spec('scipy'),'Independent audit requires SciPy')
class TradeAuditTests(unittest.TestCase):
    def test_finds_multi_output_profit_hidden_by_each_output_alone(self):
        prices={'INPUT':{'buy':Decimal(10),'sell':Decimal(1)},'A':{'buy':Decimal(24),'sell':Decimal(6)},'B':{'buy':Decimal(24),'sell':Decimal(6)}}
        operations=[audit.operation('split',{'INPUT':Decimal(1)},{'A':Decimal(1),'B':Decimal(1)},'recipe')]
        result=audit.solve(prices,operations,budget=10)
        self.assertEqual(result['status'],'optimal');self.assertAlmostEqual(result['profit'],2)

    def test_safe_quote_does_not_hide_a_loss_as_profit(self):
        prices={'ITEM':{'buy':Decimal(4),'sell':Decimal(1)}}
        result=audit.solve(prices,[],budget=100)
        self.assertEqual(result['status'],'optimal');self.assertAlmostEqual(result['profit'],0)

    def test_inventory_is_conserved_through_multiple_steps(self):
        prices={'INPUT':{'buy':Decimal(10),'sell':Decimal(1)},'OUTPUT':{'buy':Decimal(80),'sell':Decimal(20)}}
        operations=[audit.operation('stage_one',{'INPUT':Decimal(1)},{'INTERMEDIATE':Decimal(2)},'recipe'),audit.operation('stage_two',{'INTERMEDIATE':Decimal(2)},{'OUTPUT':Decimal(1)},'recipe')]
        result=audit.solve(prices,operations,budget=10)
        self.assertEqual(result['status'],'optimal');self.assertAlmostEqual(result['profit'],10)

    def test_returned_bucket_uses_best_conversion_before_sale(self):
        r=audit.model.recipe('free_water','WATER_BUCKET',{'BUCKET':1},kind='modeled_water_filling')
        values=audit.model.redemption_values({'BUCKET':Decimal('8.5'),'WATER_BUCKET':Decimal('8.58')},[r])
        self.assertEqual(values['BUCKET'],Decimal('8.58'))
        lava=audit.model.recipe('lava_fuel','FUEL_UNIT',{'LAVA_BUCKET':1},100,kind='modeled_fuel')
        lava['returns']={'BUCKET':1}
        cost=audit.model.recipe_cost(lava,{'LAVA_BUCKET':Decimal('44.2')},values)
        self.assertEqual(cost,Decimal('.3562'))

    def test_current_list_has_no_profitable_combination_in_expanded_audit(self):
        payload=json.loads(audit.model.PRICE_FILE.read_text())
        report=audit.audit(payload)
        self.assertEqual(report['numericViolations'],[])
        self.assertEqual(report['directBuySellLoops'],[])
        self.assertEqual(report['confirmedExamples'],[])
        for name in ['baselineLinearCheck','expandedLinearCheck','maximumDropScenarioCheck']:
            with self.subTest(check=name):
                self.assertEqual(report[name]['status'],'optimal')
                self.assertLessEqual(report[name]['profit'],.000001)
        _,recipes,*_=audit.model.build_model(payload)
        grindstone=[r for r in recipes if r['type']=='modeled_grindstone']
        self.assertTrue(grindstone)
        self.assertFalse(any('CURSE' in item for r in grindstone for i in r['inputs'] for item in i['items']))

if __name__=='__main__':unittest.main()
