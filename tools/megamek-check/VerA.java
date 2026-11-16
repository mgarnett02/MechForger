import java.io.*;
import megamek.common.loaders.MekFileParser;
import megamek.common.units.*;
import megamek.common.equipment.EquipmentType;
import megamek.common.verifier.*;

public class VerA {
  public static void main(String[] args) throws Exception {
    EquipmentType.initializeTypes();
    EntityVerifier v = EntityVerifier.getInstance(new File("nonexistent.xml"));
    BufferedReader in = new BufferedReader(new InputStreamReader(java.lang.System.in));
    String f;
    while ((f = in.readLine()) != null) {
      try {
        Entity e = new MekFileParser(new File(f)).getEntity();
        TestEntity t;
        if (e instanceof Jumpship j) t = new TestAdvancedAerospace(j, v.aeroOption, f);
        else if (e instanceof SmallCraft s) t = new TestSmallCraft(s, v.aeroOption, f);
        else continue;
        StringBuffer sb = new StringBuffer();
        boolean ok = t.correctEntity(sb, e.getTechLevel());
        java.lang.System.out.println(e.getChassis() + " " + e.getModel() + "\t" + (e.isClan() ? "Clan" : "IS") + "\t" + e.getWeight() + "\t" + t.calculateWeight() + "\t" + ok
          + "\tstruct=" + t.getWeightStructure() + "\tengine=" + t.getWeightEngine() + "\tarmor=" + t.getWeightArmor() + "\tctrl=" + t.getWeightControls()
          + "\ths=" + t.getWeightHeatSinks() + "\tmisc=" + t.getWeightMisc() + "\tammo=" + t.getWeightAmmo() + "\tcarry=" + t.getWeightCarryingSpace()
          + "\tmiscEq=" + t.getWeightMiscEquip() + "\tweap=" + t.getWeightWeapon() + "\tpa=" + t.getWeightPowerAmp() + "\t" + sb.toString().replace("\n", " | "));
      } catch (Throwable t) { java.lang.System.out.println(f + "\tERROR " + t); }
    }
  }
}
