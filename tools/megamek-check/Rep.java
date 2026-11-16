import java.io.*;
import megamek.common.loaders.MekFileParser;
import megamek.common.units.Entity;
import megamek.common.equipment.EquipmentType;
import megamek.client.ui.clientGUI.calculationReport.TextCalculationReport;

public class Rep {
  public static void main(String[] args) throws Exception {
    EquipmentType.initializeTypes();
    for (String f : args) {
      Entity e = new MekFileParser(new File(f)).getEntity();
      TextCalculationReport bv = new TextCalculationReport();
      e.calculateBattleValue(true, true, bv);
      TextCalculationReport c = new TextCalculationReport();
      e.getCost(c, false);
      System.out.println("=== " + e.getChassis() + " " + e.getModel());
      System.out.println(bv.toString());
      System.out.println(c.toString());
    }
  }
}
