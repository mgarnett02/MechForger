import java.io.*;
import java.nio.file.*;
import megamek.common.loaders.MekFileParser;
import megamek.common.units.Entity;
import megamek.common.equipment.EquipmentType;

public class BV {
  public static void main(String[] args) throws Exception {
    EquipmentType.initializeTypes();
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    String f;
    while ((f = in.readLine()) != null) {
      try {
        Entity e = new MekFileParser(new File(f)).getEntity();
        int bv = e.calculateBattleValue(true, true);
        long cost = Math.round(e.getCost(false));
        long dry = Math.round(e.getCost(true));
        System.out.println(f + "\t" + e.getChassis() + "\t" + e.getModel() + "\t" + bv + "\t" + cost + "\t" + dry + "\t" + (e.isClan() ? "Clan" : "IS") + "\t" + e.getWeight());
      } catch (Throwable t) {
        System.out.println(f + "\tERROR\t" + t);
      }
    }
  }
}
