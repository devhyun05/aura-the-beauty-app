using ARMakeup.Face;
using NUnit.Framework;
using UnityEngine;

namespace Aura.ARwithFable.Tests
{
    public sealed class SplitMaskContractTests
    {
        [Test]
        public void SplitRestoresAfterEveryFilterButBeforeGuides()
        {
            Assert.That(MakeupQueues.SplitMask, Is.GreaterThan(MakeupQueues.LipLiner));
            Assert.That(MakeupQueues.SplitMask, Is.GreaterThan(MakeupQueues.Lighting));
            Assert.That(MakeupQueues.SplitMask, Is.LessThan(MakeupQueues.StencilGuide));
        }

        [Test]
        public void SplitShaderConsumesExplicitUnfilteredFrameMapping()
        {
            var shader = Shader.Find("ARMakeup/SplitMask");
            Assert.That(shader, Is.Not.Null);

            var material = new Material(shader);
            try
            {
                Assert.That(material.HasProperty("_SourceTex"), Is.True);
                Assert.That(material.HasProperty("_ViewportToImageU"), Is.True);
                Assert.That(material.HasProperty("_ViewportToImageV"), Is.True);
            }
            finally
            {
                Object.DestroyImmediate(material);
            }
        }
    }
}
