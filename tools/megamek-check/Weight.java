import java.io.*;
import megamek.common.loaders.MekFileParser;
import megamek.common.units.Entity;
import megamek.common.equipment.EquipmentType;
import megamek.common.verifier.EntityVerifier;
import megamek.common.verifier.TestEntity;

/**
 * MegaMek's construction weight and legality for each unit file read from stdin:
 * file, chassis, model, tech base, tonnage, calculated weight, legal, problems.
 * With "-v" it prints MegaMek's itemized weight breakdown instead.
 */
public class Weight {
  public static void main(String[] args) throws Exception {
    boolean verbose = args.length > 0 && args[0].equals("-v");
    EquipmentType.initializeTypes();
    EntityVerifier.getInstance(new File("data/mekfiles/UnitVerifierOptions.xml"));
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    String f;
    while ((f = in.readLine()) != null) {
      try {
        Entity e = new MekFileParser(new File(f)).getEntity();
        TestEntity t = TestEntity.getEntityVerifier(e);
        if (t == null) {
          System.out.println(f + "\tNOVERIFIER\t" + e.getChassis() + "\t" + e.getModel());
          continue;
        }
        if (verbose) {
          System.out.println("=== " + f);
          System.out.println(t.printEntity());
        }
        StringBuffer sb = new StringBuffer();
        boolean ok = t.correctEntity(sb);
        System.out.println(f + "\t" + e.getChassis() + "\t" + e.getModel() + "\t" + (e.isClan() ? "Clan" : "IS") + "\t"
              + e.getWeight() + "\t" + t.calculateWeight() + "\t" + (ok ? "LEGAL" : "ILLEGAL") + "\t"
              + sb.toString().trim().replace("\r", "").replace("\n", " | "));
      } catch (Throwable x) {
        System.out.println(f + "\tERROR\t" + x);
      }
    }
  }
}
