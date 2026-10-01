# NMC brand theme for SharePoint Online — matches neighborhoodmc.com and the NMC Toolkit
# Run once by a SharePoint admin (needs the SharePoint Online Management Shell).
# After it runs, any site owner can pick "Neighborhood Mortgage" under Settings > Change the look > Theme.

Connect-SPOService -Url "https://YOURTENANT-admin.sharepoint.com"   # replace YOURTENANT

$nmc = @{
  "themePrimary"         = "#a53222";
  "themeLighterAlt"      = "#fbf4f3";
  "themeLighter"         = "#f0d4d0";
  "themeLight"           = "#e2b1aa";
  "themeTertiary"        = "#c66f63";
  "themeSecondary"       = "#b04435";
  "themeDarkAlt"         = "#952d1f";
  "themeDark"            = "#7e261a";
  "themeDarker"          = "#5d1c13";
  "neutralLighterAlt"    = "#fbf8f2";
  "neutralLighter"       = "#f7f1e6";
  "neutralLight"         = "#ede3d2";
  "neutralQuaternaryAlt" = "#e5e0d5";
  "neutralQuaternary"    = "#dbd5c9";
  "neutralTertiaryAlt"   = "#d2ccbf";
  "neutralTertiary"      = "#a3a6ad";
  "neutralSecondary"     = "#5c616e";
  "neutralPrimaryAlt"    = "#474b55";
  "neutralPrimary"       = "#343740";
  "neutralDark"          = "#25272e";
  "black"                = "#1b1c21";
  "white"                = "#ffffff";
}

Add-SPOTheme -Identity "Neighborhood Mortgage" -Palette $nmc -IsInverted $false -Overwrite
